// Repeatable regression checks for the induction dosage engine.
// Run after loading calc.js, body-mass.js, and catalog.js in the same JS context.
// This file is not loaded by the production application.
(() => {
  'use strict';
  const math = globalThis.AnesthesiaMath;
  const mass = globalThis.AnesthesiaBodyMass;
  const catalog = globalThis.AnesthesiaCatalog;
  if (!math || !mass || !catalog) throw Error('Load calc.js, body-mass.js, catalog.js first.');
  const results = [];
  function test(name, expected, actual, tolerance = 1e-9) {
    const pass = typeof expected === 'number'
      ? typeof actual === 'number' && Math.abs(actual - expected) <= tolerance
      : expected === actual;
    results.push({name, pass, expected, actual});
  }
  function dose(unit, value, weight, concentration, cUnit, reverse = false) {
    return math.calculate({unit, value:String(value), weight:'', preparation:'direct',
      concentration:String(concentration),cUnit,quantity:'',volume:'',reverse}, String(weight ?? ''));
  }
  const p = mass.calculate({weight:'128', height:'182',sex:'male'});
  test('patient real weight',128,p.actual);
  test('patient height',182,p.height);
  test('patient BMI',38.64267600531336,p.bmi);
  test('ideal Devine male',76.8031496062992,p.ideal);
  test('adjusted mass 0.4',97.28188976377952,p.adjusted);
  test('lean Janmahasatian male',78.96282490717397,p.lean);
  const normal = mass.calculate({weight:'75',height:'178',sex:'male'});
  test('non-obese recommends actual for prop', 'actual', mass.forDrug('prop','induction',normal).mode);
  test('obese prop induction uses lean', 'lean', mass.forDrug('prop','induction',p).mode);
  test('obese fent induction uses lean', 'lean', mass.forDrug('fent','induction',p).mode);
  test('obese roc induction uses ideal', 'ideal', mass.forDrug('roc','induction',p).mode);
  test('obese prop maintenance uses actual (FAR2021)', 'actual',mass.forDrug('prop','maintenance',p).mode);
  const prop = dose('мг/кг','1,5',p.lean,10,'мг');
  test('prop 1.5 mg/kg: mg',118.44423736076095,prop.amount);
  test('prop 1.5 mg/kg: mL at 10 mg/mL',11.844423736076095,prop.answer);
  const fent = dose('мкг/кг',2,p.lean,50,'мкг');
  test('fent 2 mcg/kg: mcg',157.92564981434793,fent.amount);
  test('fent 2 mcg/kg: mL at 50 mcg/mL',3.1585129962869587,fent.answer);
  const fentFixed = dose('мкг',100,null,50,'мкг');
  test('fent absolute 100 mcg: mL',2,fentFixed.answer);
  const fentMixed = dose('мкг',100,null,0.05,'мг');
  test('fent 100 mcg at 0.05 mg/mL: mL',2,fentMixed.answer);
  const roc = dose('мг/кг','0,6',p.ideal,10,'мг');
  test('roc 0.6 mg/kg: mg',46.081889763779515,roc.amount);
  test('roc 0.6 mg/kg: mL',4.608188976377952,roc.answer);
  const rocRSI = dose('мг/кг',1,p.ideal,10,'мг');
  test('roc RSI 1 mg/kg by Devine: mg',p.ideal,rocRSI.amount);
  const infusion = dose('мг/кг/ч',4,75,10,'мг');
  test('prop infusion 4 mg/kg/h: mg/h',300,infusion.amount);
  test('prop infusion 4 mg/kg/h: mL/h',30,infusion.answer);
  const reverse = dose('мг/кг/ч',30,75,10,'мг',true);
  test('reverse 30 mL/h at 10 mg/mL: mg/kg/h',4,reverse.answer);
  const minute = dose('мкг/кг/мин',0.1,80,100,'мкг');
  test('per-minute rate converted to mL/h',4.8,minute.answer);
  const mixed = math.calculate({unit:'мг/кг',value:'1,5',weight:'',preparation:'mix',
    cUnit:'мг',concentration:'',quantity:'200',volume:'20',reverse:false},'80');
  test('200 mg in 20mL mix, prop 1.5mg/kg gives 12mL',12,mixed.answer);
  test('empty dose does not calculate',undefined,dose('мг/кг','',80,10,'мг').answer);
  test('missing weight does not calculate',undefined,dose('мг/кг',2,null,10,'мг').answer);
  test('zero concentration does not calculate volume',undefined,dose('мкг',100,null,0,'мкг').answer);
  for (const invalid of ['','0','-1','abc','1e3','1,2,3']) {
    test('reject malformed/zero input: ' + JSON.stringify(invalid),null,math.number(invalid));
  }
  const scenarios = catalog.fresh().scenarios;
  test('standard prop is 1.5 mg/kg', '1,5',scenarios.find(x=>x.id==='standard').induction[0].value);
  test('RSI roc is 1 mg/kg', '1',scenarios.find(x=>x.id==='rsi').induction.find(x=>x.drug==='roc').value);
  const failed = results.filter(r=>!r.pass);
  globalThis.UncleSamInductionAudit = {tested:results.length,passed:results.length-failed.length,failed,results};
  if(failed.length)throw Error('Induction regression: '+failed.length+' failed: '+JSON.stringify(failed));
})();
