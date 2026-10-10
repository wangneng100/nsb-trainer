const fs = require('fs');

function patch(year) {
  const p = 'banks/' + year + '.json';
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  let patched = 0;
  for (const q of data) {
    if (!q.src.round) {
      // Try to extract from file name
      // e.g. "Set-1-MS-2021" -> 1
      // e.g. "2022-MS-1" -> 1
      let m = /Set-(\d+)/i.exec(q.src.file) || /MS-(\d+)/i.exec(q.src.file);
      if (m) {
        q.src.round = m[1];
        patched++;
      }
    }
  }
  if (patched > 0) {
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    console.log(`Patched ${patched} questions in ${year}.json`);
  }
}

[2021, 2022].forEach(patch);
