(() => {
  const select=document.querySelector('#publication-sort'), list=document.querySelector('#publication-list');
  if (!select || !list) return;
  const collator=new Intl.Collator(undefined,{sensitivity:'base',numeric:true});
  select.addEventListener('change',() => {
    const entries=[...list.children];
    entries.sort((a,b) => { const author=collator.compare(a.dataset.author,b.dataset.author); const date=Number(b.dataset.year)-Number(a.dataset.year); return select.value === 'author' ? (author || date) : (date || author); });
    list.replaceChildren(...entries);
  });
})();
