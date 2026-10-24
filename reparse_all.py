import os, re, glob, json, subprocess
from concurrent.futures import ThreadPoolExecutor
import pdfplumber

SET_YEAR_MAP = {
    'set-10': '2016',
    'set-11': '2017',
    'set-12': '2018',
    'set-13': '2019',
    'set-14': '2020',
    'set-15': '2021',
    'set-16': '2022',
}

def get_round(fname):
    m = (re.search(r'Set-(\d+)', fname, re.I) or
         re.search(r'Round-(\d+)', fname, re.I) or
         re.search(r'Rd\s*(\d+)', fname, re.I) or
         re.search(r'MS[_-](\d+)', fname, re.I) or
         re.search(r'^(\d+)A?_', fname, re.I))
    return m.group(1) if m else ''

def extract_lines_from_page(page):
    chars = [c for c in page.chars if c.get('text')]
    if not chars:
        return []
    
    chars.sort(key=lambda c: (c['top'], c['x0']))
    lines = []
    for c in chars:
        placed = False
        for line in lines:
            h = max(line['main_size'], c['size'], 10.0)
            line_mid = (line['top'] + line['bottom']) / 2.0
            c_mid = (c['top'] + c['bottom']) / 2.0
            if abs(line_mid - c_mid) < 0.6 * h:
                line['chars'].append(c)
                if c['size'] > line['main_size'] and c['text'].strip():
                    line['main_size'] = c['size']
                    line['top'] = c['top']
                    line['bottom'] = c['bottom']
                    line['y0'] = c['y0']
                placed = True
                break
        if not placed:
            lines.append({
                'top': c['top'],
                'bottom': c['bottom'],
                'y0': c['y0'],
                'main_size': c['size'],
                'chars': [c]
            })
    lines.sort(key=lambda l: l['top'])
    out = []
    for line in lines:
        l_chars = sorted(line['chars'], key=lambda c: c['x0'])
        main_sz = line['main_size']
        baseline_btm = line['bottom']
        parts = []
        prev = None
        for c in l_chars:
            txt = c['text']
            sz = c['size']
            is_small = sz < 0.85 * main_sz
            rel = baseline_btm - c['bottom']
            mode = 'n'
            if is_small:
                if rel > 0.15 * main_sz:
                    mode = 'sup'
                elif rel < -0.15 * main_sz:
                    mode = 'sub'
            space = ''
            if prev:
                gap = c['x0'] - prev['x1']
                if gap > 0.18 * min(sz, prev['size']):
                    space = ' '
            if parts and parts[-1]['mode'] == mode:
                parts[-1]['text'] += space + txt
            else:
                parts.append({'mode': mode, 'text': (space if mode == 'n' else '') + txt})
            prev = c
        line_str = ''
        for p in parts:
            s = p['text'].strip()
            if not s: continue
            trail = ' ' if p['text'].endswith(' ') else ''
            lead = ' ' if p['text'].startswith(' ') and line_str and not line_str.endswith(' ') else ''
            if p['mode'] == 'n':
                line_str += lead + s + trail
            elif p['mode'] == 'sup':
                if re.match(r'^(st|nd|rd|th)$', s, re.I):
                    line_str += lead + s + trail
                else:
                    body = s if re.match(r'^[\w.]+$', s) else f'({s})'
                    line_str += lead + f'^{body}' + trail
            elif p['mode'] == 'sub':
                body = s if re.match(r'^[\w.]+$', s) else f'({s})'
                line_str += lead + f'_{body}' + trail
        line_str = re.sub(r'\s+', ' ', line_str).strip()
        if line_str:
            out.append(line_str)
    return out

def strip_repeated_lines(pages):
    if len(pages) < 3:
        return pages
    def key_fn(l):
        return re.sub(r'\d+', '#', l).strip().lower()
    counts = {}
    for p in pages:
        for k in set(key_fn(l) for l in p):
            counts[k] = counts.get(k, 0) + 1
    threshold = max(3, int(len(pages) * 0.5))
    clean_pages = []
    for p in pages:
        clean_p = []
        for l in p:
            k = key_fn(l)
            if counts.get(k, 0) >= threshold and not re.match(r'^(TOSS|BONUS|ANSWER)', l, re.I) and len(l) <= 90:
                continue
            if re.search(r'^(?:20\d\d\s+.*Page\s+\d+|.*National Science Bowl.*Page\s+\d+|.*Middle School Regional.*PAGE\s+\d+|.*Middle School.*Page\s+\d+|.*Regional Science Bowl.*Page\s+\d+|PAGE\s+\d+|Page\s+\d+)$', l, re.I):
                continue
            clean_p.append(l)
        clean_pages.append(clean_p)
    return clean_pages

def extract_pdf(path):
    fname = os.path.splitext(os.path.basename(path))[0]
    rnd = get_round(fname)
    try:
        with pdfplumber.open(path) as pdf:
            pages = [extract_lines_from_page(p) for p in pdf.pages]
            clean_pages = strip_repeated_lines(pages)
            text = '\n'.join('\n'.join(p) for p in clean_pages)
        return {'file': fname, 'round': rnd, 'text': text}
    except Exception as e:
        print(f"Error extracting {path}: {e}")
        return None

def process_year(set_dir, year):
    print(f"\nProcessing {set_dir} -> {year}...")
    pdf_paths = sorted(glob.glob(f"problem_sets/{set_dir}/*.pdf"))
    if not pdf_paths:
        print(f"No PDFs found in problem_sets/{set_dir}")
        return

    # Load existing questions to preserve IDs
    existing_bank_path = f"banks/{year}.json"
    existing_id_map = {}
    if os.path.exists(existing_bank_path):
        try:
            with open(existing_bank_path, 'r', encoding='utf-8') as f:
                old_items = json.load(f)
            for item in old_items:
                src = item.get('src') or {}
                k_fmt = f"{src.get('file')},{src.get('num')},{item.get('type')},{item.get('format')}"
                k_gen = f"{src.get('file')},{src.get('num')},{item.get('type')}"
                existing_id_map[k_fmt] = item.get('id')
                if k_gen not in existing_id_map:
                    existing_id_map[k_gen] = item.get('id')
        except Exception as e:
            print(f"Could not read existing bank {existing_bank_path}: {e}")

    with ThreadPoolExecutor(max_workers=4) as ex:
        extracted = list(filter(None, ex.map(extract_pdf, pdf_paths)))

    # Process in Node using importer.js
    node_code = '''
const I = require('./js/importer.js');
let raw = '';
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  const { extracted, existing_id_map, year } = JSON.parse(raw);
  const out = [];
  const counts = {};

  for (const item of extracted) {
    const res = I.parseNSB(item.text, { file: item.file, round: item.round });
    for (const q of res.questions) {
      q.answer = q.answer.replace(/\\s*(?:20\\d\\d\\s+.*Page\\s+\\d+|.*National Science Bowl.*Page\\s+\\d+|.*Middle School Regional.*PAGE\\s+\\d+|.*Middle School.*Page\\s+\\d+|.*Regional Science Bowl.*Page\\s+\\d+|PAGE\\s+\\d+|Page\\s+\\d+)\\s*$/i, '').trim();

      const bankItem = I.toBankItem(q);
      bankItem.year = String(year);

      if (q.subject !== 'math') {
        bankItem.tags = [];
      }

      // Preserve existing ID if available
      const keyFormat = `${q.src.file},${q.num},${q.type},${q.format}`;
      const keyGeneral = `${q.src.file},${q.num},${q.type}`;
      if (existing_id_map[keyFormat]) {
        bankItem.id = existing_id_map[keyFormat];
      } else if (existing_id_map[keyGeneral]) {
        bankItem.id = existing_id_map[keyGeneral];
      }

      out.push(bankItem);
      counts[q.subject] = (counts[q.subject] || 0) + 1;
    }
  }

  process.stdout.write(JSON.stringify({ questions: out, counts }));
});
'''
    p = subprocess.Popen(['node', '-e', node_code], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    input_data = json.dumps({'extracted': extracted, 'existing_id_map': existing_id_map, 'year': year})
    stdout, stderr = p.communicate(input=input_data)

    if stderr:
        print(f"Node stderr for {year}:", stderr)

    res = json.loads(stdout)
    questions = res['questions']
    counts = res['counts']

    with open(f"banks/{year}.json", 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(questions)} questions to banks/{year}.json:")
    for subj, cnt in sorted(counts.items()):
        print(f"  {subj}: {cnt}")

def main():
    for set_dir, year in sorted(SET_YEAR_MAP.items()):
        process_year(set_dir, year)
    print("\nAll years successfully parsed and saved!")

if __name__ == '__main__':
    main()
