(() => {
  const root = 'assets/documents/effort/2026-04/';
  document.querySelectorAll('[data-instrument-selector]').forEach(box => {
    const instrument = box.querySelector('.instrument-choice'), report = box.querySelector('.report-choice'), language = box.querySelector('.language-choice'), result = box.querySelector('.selector-result');
    function update() {
      report.disabled = !instrument.value;
      language.disabled = !instrument.value || !report.value;
      result.replaceChildren();
      if (language.disabled || !language.value) return;
      let files;
      if (language.value === 'english') files = [['English item bank, all reports (XLSX)', 'effort-english-item-bank.xlsx']];
      else if (language.value === 'spanish') files = [['Argentina Spanish workbook, all reports (XLSX)', 'effort-spanish-argentina.xlsx']];
      else { const reports = report.value === 'all' ? ['caregiver','teacher','assessor'] : [report.value]; files = reports.map(r => [`Bangla ${r} report (${r === 'assessor' ? 'PDF' : 'DOCX'})`, `effort-bangla-${r}.${r === 'assessor' ? 'pdf' : 'docx'}`]); }
      const list = document.createElement('ul'); files.forEach(([label,file]) => { const li=document.createElement('li'), a=document.createElement('a'); a.href=root+file; a.download=''; a.textContent=label; li.append(a); list.append(li); }); result.append(list);
      if (language.value !== 'bangla') { const p=document.createElement('p'); p.textContent='This workbook contains multiple reports; select the appropriate sheet after opening it.'; result.append(p); }
    }
    instrument.addEventListener('change', () => { report.value=''; language.value=''; update(); });
    report.addEventListener('change', () => { language.value=''; update(); }); language.addEventListener('change',update);
  });
})();
