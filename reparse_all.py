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

def extract_pdf(path):
    fname = os.path.splitext(os.path.basename(path))[0]
    rnd = get_round(fname)
    try:
        with pdfplumber.open(path) as pdf:
            text = '\n'.join([p.extract_text(layout=False) or '' for p in pdf.pages])
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

    # Load existing questions to preserve IDs for math questions
    existing_bank_path = f"banks/{year}.json"
    existing_id_map = {}
    if os.path.exists(existing_bank_path):
        try:
            with open(existing_bank_path, 'r', encoding='utf-8') as f:
                old_items = json.load(f)
            for item in old_items:
                src = item.get('src') or {}
                k = (str(src.get('file')), str(src.get('num')), str(item.get('type')))
                existing_id_map[k] = item.get('id')
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
      const bankItem = I.toBankItem(q);
      bankItem.year = String(year);

      // Preserve existing ID if available
      const key = `${q.src.file},${q.num},${q.type}`;
      if (existing_id_map[key]) {
        bankItem.id = existing_id_map[key];
      }

      out.push(bankItem);
      counts[q.subject] = (counts[q.subject] || 0) + 1;
    }
  }

  process.stdout.write(JSON.stringify({ questions: out, counts }));
});
'''
    p = subprocess.Popen(['node', '-e', node_code], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    input_data = json.dumps({'extracted': extracted, 'existing_id_map': { f"{k[0]},{k[1]},{k[2]}": v for k, v in existing_id_map.items() }, 'year': year})
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
