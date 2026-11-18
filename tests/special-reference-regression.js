// Run: node tests/special-reference-regression.js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const context = {module:{exports:{}}};
vm.createContext(context);
for (const name of ['special-reference-data.js','special-reference.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'), context, {filename:name});
}
const data = context.AnesthesiaSpecialReferenceData;
const {normalize,matches} = context.module.exports;
const sections = data.topics.flatMap(topic => topic.sections);
assert.deepEqual(Array.from(data.topics,topic=>topic.id),['pregnancy','children','antithrombotics']);
assert.deepEqual(Array.from(data.topics,topic=>topic.sections.length),[8,6,8]);
assert.equal(sections.length,22);
assert.equal(new Set(sections.map(section=>section.id)).size,22);
assert.equal(data.sources.length,21);
assert.equal(normalize('  ПЕЧЁНЬ  '),'печень');
const byId = id => sections.find(section=>section.id===id);
assert(matches(byId('2-5'),'ПРОПОФОЛ'));
assert(matches(byId('2-5'),'пропофол 20 мг/мл'));
assert(!matches(byId('2-5'),'пропофол несуществующий-препарат'));
assert(matches(byId('3-4'),'фондапаринукс'));
assert(byId('3-4').text.includes('нельзя представлять как согласованное разрешение удалить катетер через 6 ч'));
assert(byId('3-4').text.includes('ASRA 2025'));
assert(byId('2-5').text.includes('до 16 лет'));
assert(byId('2-5').text.includes('возраст до 1 года указан как противопоказание'));
assert(byId('3-5').text.includes('Апиксабан 2,5 мг 2 раза/сут при фибрилляции предсердий'));
assert(byId('3-7').text.includes('Очередная доза по прежнему режиму остаётся в 08:00 следующего дня'));
for(const topic of data.topics) {
  for(const jump of topic.quick) assert(topic.sections.some(section=>section.id===jump.id));
  for(const section of topic.sections) {
    assert(section.sources.length>0);
    for(const id of section.sources) assert(data.sources.some(source=>source.id===id));
    assert(!/<(?:script|iframe|object)\b|\son\w+=/i.test(section.html));
    assert(!/javascript:/i.test(section.html));
  }
}
const combined=JSON.stringify(data);
assert(!/chatgpt\.com\/library|libfile_|Antithrombotics-regional-anesthesia-A4|с qr кодом/.test(combined));
for(const source of data.sources) for(const link of source.links) assert(new URL(link.url).protocol==='https:');
console.log('Special reference: topics, 22 sections, source links, search, clinical caveats and protected-file exclusion passed.');
