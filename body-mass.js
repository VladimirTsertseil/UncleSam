// Взрослые: антропометрические показатели и справочные ориентиры массы.
(() => {
  'use strict';
  const modes = [
    ['actual', 'Фактическая (ФМТ)'],
    ['ideal', 'Идеальная (ИдМТ, Devine)'],
    ['adjusted', 'Скорректированная (СкМТ, 0,4)'],
    ['lean', 'Тощая (ТМТ, Janmahasatian)']
  ];
  const labels = Object.fromEntries(modes);
  const round = value => Math.round(value * 10) / 10;
  const fmt = value => value === null || !Number.isFinite(value) ? '—'
    : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value);
  function parse(value) {
    const text = String(value ?? '').trim().replace(',', '.');
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
    const result = Number(text);
    return Number.isFinite(result) ? result : null;
  }
  function calculate({weight, height, sex} = {}) {
    const actual = parse(weight);
    const h = parse(height);
    const validActual = actual !== null && actual >= 20 && actual <= 350;
    const validHeight = h !== null && h >= 140 && h <= 230;
    const validSex = sex === 'male' || sex === 'female';
    const result = {actual:validActual ? actual : null, height:validHeight ? h : null,
      sex:validSex ? sex : null, bmi:null, ideal:null, adjusted:null, lean:null, obese:false};
    if (!validActual || !validHeight) return result;
    result.bmi = actual / (h / 100) ** 2;
    result.obese = result.bmi >= 30;
    if (!validSex) return result;
    // Devine: 50/45,5 кг при 152,4 см плюс 2,3 кг на каждый дюйм выше.
    // Для роста меньше 152,4 см формула не экстраполируется.
    if (h >= 152.4) {
      result.ideal = (sex === 'male' ? 50 : 45.5) + 2.3 * (h - 152.4) / 2.54;
      result.adjusted = result.ideal + 0.4 * (actual - result.ideal);
    }
    // Тощая масса по Janmahasatian; математическая оценка, не измерение состава тела.
    result.lean = 9270 * actual / (sex === 'male'
      ? 6680 + 216 * result.bmi : 8780 + 244 * result.bmi);
    return result;
  }
  const guidelines = {
    prop: {induction:['lean','Индукция при ожирении: тощая масса (ФАР, 2021). Титровать по эффекту.'],
      maintenance:['actual','Поддержание при ожирении: фактическая масса по ФАР (2021); существуют альтернативные протоколы со скорректированной массой. Титровать.']},
    fent: {induction:['lean','При дозировании фентанила в мкг/кг у пациента с ожирением ФАР рекомендует тощую массу.'],
      maintenance:['lean','При ожирении ориентир по ФАР — тощая масса, с титрованием анальгезии.']},
    roc: {induction:['ideal','При ожирении ФАР допускает идеальную или тощую массу. При быстрой последовательной индукции дозирование и время наступления блока требуют отдельной оценки. Количественный мониторинг нервно-мышечной проводимости используйте для последующего ведения.'],
      maintenance:['ideal','При ожирении идеальная или тощая масса (ФАР). Инфузию титровать по количественному мониторингу блока.']},
    remi:{maintenance:['ideal','При ожирении при ручной инфузии ориентир — идеальная масса (инструкция к ремифентанилу). Модели целевой инфузии рассматриваются отдельно.']},
    dex:{maintenance:['ideal','При ожирении идеальная масса (ФАР, 2021); скорость титровать по седации и гемодинамике.']},
    mid:{maintenance:['ideal','Для поддержания при ожирении идеальная масса по ФАР; при индукции рекомендации другие.']},
    atra:{maintenance:['actual','Для атракурия ФАР указывает фактическую массу, хотя встречаются и другие рекомендации. Используйте контроль TOF.']},
    cis:{maintenance:['ideal','Для цисатракурия при ожирении ФАР допускает идеальную или тощую массу. Контроль TOF.']}
  };
  const uncertain = 'Единого подтверждённого правила выбора массы для этого режима нет. ФМТ — только исходный вариант; при ожирении проверьте инструкцию и протокол и при необходимости выберите другую массу.';
  function forDrug(id,stage,profile) {
    if (!profile?.obese) return {mode:'actual',note:'Без ожирения — фактическая масса, если инструкция конкретного препарата не требует иного.',uncertain:false};
    const rule = guidelines[id]?.[stage];
    return rule ? {mode:rule[0],note:rule[1],uncertain:false}
      : {mode:'actual',note:uncertain,uncertain:true};
  }
  function forCalculator(id,profile) {
    if(id==='crcl') {
      if (!profile?.obese) return {mode:'actual',note:'Обычно фактическая масса; при недостаточной массе тела и особых клинических обстоятельствах сверяйте методику. Для конкретного препарата проверьте его инструкцию.'};
      return {mode:profile.adjusted !== null ? 'adjusted' : 'actual',
        note:'При ожирении скорректированная масса — один из применяемых ориентиров, но для разных препаратов используются разные правила. Сравните клиренс по всем трём массам; не приравнивайте клиренс к диагнозу повреждения почек.'};
    }
    if(id==='blood-volume'||id==='blood-loss')return {mode:'actual',note:'Формула Nadler использует фактическую массу и рост. Подстановка идеальной массы меняет модель и не является проверенной поправкой при ожирении.'};
    if(id==='sodium')return {mode:'actual',note:'Расчёт общей воды использует фактическую массу и выбранную долю воды. При ожирении, отёках и дегидратации оценка неточна; контролируйте натрий повторно.'};
    return {mode:'actual',note:'Уточните используемый показатель массы в методике конкретного расчёта.'};
  }
  const choose = (profile, mode, recommended) => {
    const selected = mode === 'recommended' || !mode ? recommended : mode;
    return Object.hasOwn(labels,selected) ? profile?.[selected] ?? null : null;
  };
  globalThis.AnesthesiaBodyMass = {calculate,modes,labels,fmt,forDrug,forCalculator,choose};
})();
