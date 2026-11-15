(() => {
  'use strict';

  const { num, choice, result, source, fmt, signed } = AnesthesiaCalculators;
  const sex = () => choice('sex', 'Пол для расчёта', [['male','Мужской'], ['female','Женский']]);
  const weight = () => num('weight', 'Масса тела, кг', 20, 350);
  const anthropometry = [sex(), num('height','Рост, см',80,250),weight()];
  const nadler = source('Nadler и соавт., 1962 · формула ОЦК у взрослых','https://pubmed.ncbi.nlm.nih.gov/21936146/');
  const gross = source('Gross, 1983 · кровопотеря с поправкой на разведение','https://pubmed.ncbi.nlm.nih.gov/6829965/');
  const hypo = source('Европейское руководство по гипонатриемии, 2014','https://pubmed.ncbi.nlm.nih.gov/24569125/');
  const osmotic = source('Sterns и соавт., 2024 · коррекция при высоком риске осмотической демиелинизации','https://pubmed.ncbi.nlm.nih.gov/37379081/');
  const hyper = source('Yun и соавт., 2023 · гипернатриемия у взрослых и формула Адроге–Мадиаса','https://pmc.ncbi.nlm.nih.gov/articles/PMC10175862/');
  const acid = source('MSD, профессиональная версия · компенсация кислотно-основных нарушений','https://www.msdmanuals.com/professional/nephrology/acid-base-regulation-and-disorders/acid-base-disorders');
  const ml = value => `${fmt(Math.round(value))} мл`;
  const mmol = value => `${fmt(value)} ммоль/л`;
  const na = (key, label) => num(key, `${label}, ммоль/л`, 90, 200);
  const bicarbonate = () => num('hco3','Бикарбонат HCO₃⁻, ммоль/л',1,80);

  function bloodVolume(v) {
    const [height, mass, intercept] = v.sex === 'male' ? [0.3669, 0.03219, 0.6041] : [0.3561, 0.03308, 0.1833];
    return 1000 * (height * (v.height / 100) ** 3 + mass * v.weight + intercept);
  }

  const bloodMode = choice('volumeMode','Исходный ОЦК',[['nadler','По росту и массе (Nadler)'],['known','Ввести исходный ОЦК']], 'nadler');
  const bloodMeasure = choice('measure','Показатель',[['hb','Гемоглобин (г/л)'],['hct','Гематокрит (%)']], 'hb', ['initial','target']);

  const sodiumMode = choice('mode','Задача',[['water','Дефицит свободной воды'],['infusion','Прогноз изменения после инфузии'],['trend','Фактическая динамика и скорость']], 'water');
  const waterRatio = num('waterRatio','Доля воды от массы тела',0.3,0.8,
    {note:'Десятичная доля. Примерные ориентиры для взрослых: 0,6 у мужчин, 0,5 у женщин, ниже при пожилом возрасте или дегидратации.'});
  const trendMode = choice('status','Исходное нарушение',[['hypo','Гипонатриемия'],['hypoRisk','Гипонатриемия · высокий риск осмотической демиелинизации'],['hyper','Гипернатриемия · хроническая или неясной длительности'],['other','Другая ситуация']]);
  const trendDay = choice('period','Период коррекции',[['first','Первые 24 часа'],['later','Последующие сутки']]);
  const acidTypes = [
    ['met-acid','Метаболический ацидоз'], ['met-alk','Метаболический алкалоз'],
    ['resp-acid-acute','Острый респираторный ацидоз'], ['resp-acid-chronic','Хронический респираторный ацидоз'],
    ['resp-alk-acute','Острый респираторный алкалоз'], ['resp-alk-chronic','Хронический респираторный алкалоз']
  ];

  function compensation(v) {
    const measuredPH = 6.1 + Math.log10(v.hco3 / (0.03 * v.pco2));
    if (Math.abs(v.ph - measuredPH) > 0.08) {
      return {error:'pH, PaCO₂ и HCO₃⁻ не согласуются. Проверьте единицы и что значения взяты из одной артериальной пробы.',field:'ph'};
    }
    const metabolic = v.type.startsWith('met-');
    const acidosis = v.type.includes('-acid');
    if ((metabolic && (acidosis ? v.hco3 >= 24 : v.hco3 <= 24)) ||
        (!metabolic && (acidosis ? v.pco2 <= 40 : v.pco2 >= 40))) {
      return {error:'Показатель первичного нарушения не соответствует выбранному типу. Проверьте газовый анализ или выберите другую гипотезу.',field:'type'};
    }
    let limits;
    if (v.type === 'met-acid') {
      const expected = 1.5 * v.hco3 + 8;
      limits = [expected - 2, expected + 2];
    } else if (v.type === 'met-alk') {
      const delta = v.hco3 - 24;
      limits = [Math.min(55, 40 + 0.6 * delta), Math.min(55, 40 + 0.75 * delta)];
    } else {
      const delta = (v.pco2 - 40) / 10;
      const rates = v.type.endsWith('acute') ? [1, 2] : acidosis ? [3, 4] : [4, 5];
      limits = rates.map(rate => 24 + rate * delta).sort((a,b) => a-b);
    }
    if (limits[0] <= 0) return {error:'Показатели выходят за диапазон, где линейная формула компенсации применима.',field:'pco2'};
    const [min,max] = limits;
    const observed = metabolic ? v.pco2 : v.hco3;
    const parameter = metabolic ? 'PaCO₂' : 'HCO₃⁻';
    const units = metabolic ? 'мм рт. ст.' : 'ммоль/л';
    const extra = metabolic ? ['респираторный алкалоз', 'респираторный ацидоз'] : ['метаболический ацидоз', 'метаболический алкалоз'];
    const offset = observed < min ? 0 : observed > max ? 1 : -1;
    const phStatus = v.ph < 7.35 ? 'Ацидемия' : v.ph > 7.45 ? 'Алкалемия' : 'pH в референсном диапазоне';
    const interpretation = offset < 0 ? `${phStatus}. Измеренный показатель сопоставим с ожидаемой компенсацией.` :
      `${phStatus}. Измеренный показатель ${offset === 0 ? 'ниже' : 'выше'} ожидаемого. Возможен дополнительный ${extra[offset]}.`;
    return result(`${parameter} ${fmt(min)}–${fmt(max)} ${units}`, interpretation,
      'Сопоставьте расчёт с симптомами, анионной разницей, лактатом и временем развития нарушения. При расхождении повторите газовый анализ и уточните причину.',
      [['Измеренный показатель', `${fmt(observed)} ${units}`]]);
  }

  globalThis.AnesthesiaCriticalCalculators = [
    {
      id: 'blood-volume', title: 'Объём циркулирующей крови', description: 'Ориентировочный ОЦК взрослого по формуле Nadler.',
      fields: anthropometry, sources:[nadler],
      compute(v) {
        const volume = bloodVolume(v);
        return result(ml(volume), 'Расчётный объём крови по полу, росту и массе. Формула получена у взрослых без выраженных изменений объёма крови.',
          'При беременности, выраженном ожирении, отёках или нестабильной гемодинамике оценка может отличаться от фактической. Уточните исходный ОЦК перед расчётом кровопотери.',
          [['На кг фактической массы', `${fmt(volume / v.weight)} мл/кг`]]);
      }
    }, {
      id: 'blood-loss', title: 'Допустимая кровопотеря', description: 'Ориентир для планирования по формуле Gross с усреднением исходного и целевого показателей.',
      fields: v => {
        const hct = v.measure === 'hct';
        const index = hct ? 'гематокрит, %' : 'гемоглобин, г/л';
        return [bloodMode, ...(v.volumeMode === 'known' ? [num('volume','Исходный ОЦК, мл',800,20000)] : anthropometry), bloodMeasure,
          num('initial',`Исходный ${index}`, hct ? 5 : 10, hct ? 80 : 250), num('target',`Целевой ${index}`, hct ? 5 : 10, hct ? 80 : 250)];
      },
      sources: [gross, nadler],
      compute(v) {
        if (v.target > v.initial) return {error:'Целевое значение выше исходного. Для этой цели допустимую кровопотерю рассчитать нельзя.',field:'target'};
        const volume = v.volumeMode === 'known' ? v.volume : bloodVolume(v);
        const loss = volume * (v.initial - v.target) / ((v.initial + v.target) / 2);
        if (loss >= volume) return {error:'Расчёт достигает исходного ОЦК. Проверьте целевой показатель: при таком снижении формула непригодна для планирования.',field:'target'};
        return result(ml(loss), 'Оценка при поддержании объёма крови по заданному вами целевому гемоглобину или гематокриту.',
          'Используйте для подготовки к ожидаемой кровопотере. При активном кровотечении действуйте по гемодинамике, темпу потерь, лабораторной динамике и протоколу кровотечения. Результат сам по себе не определяет трансфузию.',
          [['Исходный ОЦК',ml(volume)]]);
      }
    }, {
      id: 'sodium', title: 'Натрий · дефицит и динамика', description: 'Оценка дефицита воды, теоретического эффекта инфузии или измеренной скорости коррекции.',
      fields: v => {
        if (v.mode === 'trend') {
          return [sodiumMode, trendMode, ...(v.status === 'hypo' ? [trendDay] : []), na('current','Текущий Na'), na('start','Na в начале интервала'),
            num('time','Часы между измерениями',0.1,48,{note:'Для оценки суточного лимита укажите интервал до 24 часов.'})];
        }
        const common = [sodiumMode, na('current','Текущий Na'), weight(), waterRatio];
        return v.mode === 'infusion' ? [...common, num('fluidNa','Натрий в растворе, ммоль/л',0,1500),
          num('fluidK','Калий в растворе, ммоль/л',0,1500),num('fluidVolume','Объём раствора, мл',1,10000)] :
          [...common, num('target','Целевой Na, ммоль/л',135,199)];
      },
      sources: [hyper, hypo, osmotic],
      compute(v) {
        if (v.mode === 'trend') {
          if ((v.status.startsWith('hypo') && v.start >= 135) || (v.status === 'hyper' && v.start <= 145)) {
            return {error:'Na в начале интервала не соответствует выбранному исходному нарушению.',field:'start'};
          }
          const delta = v.current - v.start;
          const correction = delta / v.time;
          let interpretation = 'Разница между двумя измерениями. Средняя скорость может скрывать более быстрое изменение внутри интервала.';
          let action = 'Сопоставьте с серийными измерениями Na, диурезом и клинической динамикой. При неожиданном изменении срочно пересмотрите терапию и подтвердите результат.';
          if (v.status.startsWith('hypo')) {
            const limit = v.status === 'hypoRisk' || v.period === 'later' ? 8 : 10;
            interpretation += ` Ориентир верхней границы прироста: ${limit} ммоль/л за 24 ч.`;
            if (delta >= limit && v.time <= 24) action = 'Прирост достиг или превысил лимит за указанный интервал. Срочно пересмотрите коррекцию, повторите Na и примените протокол лечения избыточной коррекции.';
          }
          if (v.status === 'hyper') {
            interpretation += ' При хронической гипернатриемии традиционный ориентир темпа снижения — около ≤0,5 ммоль/л/ч или до 10–12 ммоль/л за сутки.';
            if (-correction > 0.5) action = 'Средняя скорость выше традиционного ориентира. Повторите Na и пересмотрите темп восполнения воды с учётом длительности нарушения и динамики состояния.';
          }
          if (v.time > 24) interpretation += ' Интервал больше суток: для проверки лимита разберите отдельные 24-часовые отрезки.';
          return result(`${signed(correction)} ммоль/л/ч`, interpretation, action, [['Изменение Na',`${signed(delta)} ммоль/л за ${fmt(v.time)} ч`]]);
        }
        const tbw = v.weight * v.waterRatio;
        const metrics = [['Общая вода организма', `${fmt(tbw)} л`]];
        if (v.mode === 'infusion') {
          const liters = v.fluidVolume / 1000;
          const delta = liters * (v.fluidNa + v.fluidK - v.current) / (tbw + liters);
          return result(`ΔNa ${signed(delta)} ммоль/л`, 'Теоретическое изменение при смешивании, обобщение формулы Адроге–Мадиаса на заданный объём. Диурез, потери и изменения терапии в модели отсутствуют.',
            'Проверьте фактический состав раствора и повторяйте измерения Na. При нестабильном диурезе или функции почек фактическое изменение может существенно отличаться.',
            [...metrics, ['Расчётный Na после инфузии', mmol(v.current + delta)]]);
        }
        if (v.current <= 145) return {error:'Расчёт дефицита воды предназначен для гипернатриемии (Na >145 ммоль/л).',field:'current'};
        if (v.target >= v.current) return {error:'Целевой Na должен быть ниже текущего.',field:'target'};
        const deficit = tbw * (v.current / v.target - 1);
        return result(`${fmt(deficit)} л`, 'Расчётный дефицит свободной воды до указанного Na. Продолжающиеся потери в расчёт не входят.',
          'Определите длительность нарушения, волемический статус и продолжающиеся потери. Проверьте фактическую скорость по повторным анализам Na перед изменением темпа терапии.',metrics);
      }
    }, {
      id: 'anion-gap', title: 'Анионная разница', description: 'Расчёт без калия. Поправка на альбумин при наличии результата из той же пробы.',
      fields:[na('na','Натрий'),num('cl','Хлорид, ммоль/л',40,180),bicarbonate(),
        num('albumin','Альбумин, г/л',1,70,{optional:true}),num('upper','Верхняя граница АР лаборатории, ммоль/л',1,30,{optional:true})],
      sources:[source('Figge и соавт., 1998 · коррекция анионной разницы на альбумин','https://pubmed.ncbi.nlm.nih.gov/9824071/'),acid],
      compute(v) {
        const raw = v.na - v.cl - v.hco3;
        const corrected = v.albumin === undefined ? undefined : raw + 0.25 * (40 - v.albumin);
        const assessed = corrected ?? raw;
        const kind = corrected === undefined ? 'Исходная анионная разница.' : 'Анионная разница скорректирована к альбумину 40 г/л.';
        const comparison = v.upper === undefined ? ' Для интерпретации укажите верхнюю границу из бланка лаборатории.' : assessed > v.upper ? ' Выше указанной границы.' : ' Верхняя граница не превышена.';
        return result(mmol(assessed), kind + comparison,
          corrected === undefined ? 'При гипоальбуминемии введите альбумин: без поправки повышение может быть скрыто. Сопоставьте с газами крови и лактатом.' : 'При увеличенной разнице оцените лактат, кетоны, почечную функцию и другие причины по клинике.',
          corrected === undefined ? [] : [['Без поправки',mmol(raw)]]);
      }
    }, {
      id: 'acid-base', title: 'КОС · ожидаемая компенсация', description: 'Введите артериальные показатели и выберите предполагаемое первичное нарушение.',
      fields:[num('ph','Артериальный pH',6.5,8),num('pco2','PaCO₂, мм рт. ст.',5,200),bicarbonate(),choice('type','Предполагаемое первичное нарушение',acidTypes)],
      sources:[acid], compute:compensation
    }, {
      id: 'lactate', title: 'Дефицит оснований и лактат', description: 'Стандартный избыток оснований (SBE) берите из газового анализа. Предыдущее значение лактата можно добавить для сравнения.',
      fields:[num('be','SBE, ммоль/л',-50,50),num('lactate','Текущий лактат, ммоль/л',0.1,50),
        num('previous','Предыдущий лактат, ммоль/л',0.1,50,{optional:true}),num('hours','Часы между пробами',0.1,72,{optional:true})],
      sources:[source('Surviving Sepsis Campaign, 2021 · интерпретация динамики лактата','https://doi.org/10.1007/S00134-021-06506-Y'),acid],
      compute(v) {
        if (v.hours !== undefined && v.previous === undefined) return {error:'Для оценки интервала укажите предыдущий лактат.',field:'previous'};
        const interpretation = v.be < -2 ? 'Отрицательный SBE указывает на метаболический дефицит оснований.' : v.be > 2 ? 'SBE выше типичного референса ±2 ммоль/л.' : 'SBE в типичном референсном диапазоне ±2 ммоль/л.';
        const metrics = [['Лактат',mmol(v.lactate)]];
        if (v.previous !== undefined) {
          const delta = v.lactate - v.previous;
          const duration = v.hours === undefined ? '' : ` за ${fmt(v.hours)} ч`;
          metrics.push(['Изменение лактата',`${signed(delta)} ммоль/л (${signed(100 * delta / v.previous)}%)${duration}`]);
        }
        return result(v.be < 0 ? `Дефицит оснований ${mmol(-v.be)}` : `SBE ${signed(v.be)} ммоль/л`,
          `${interpretation} ${v.lactate > 2 ? 'Лактат повышен относительно ориентира 2 ммоль/л.' : 'Лактат не превышает ориентир 2 ммоль/л.'}`,
          'Сопоставьте динамику с перфузией, пробой крови, причиной заболевания и лечением. Лактат и SBE сами по себе не определяют объём инфузии.',metrics);
      }
    }, {
      id: 'shock-index', title: 'Индекс шока', description: 'Частота сердечных сокращений, делённая на систолическое артериальное давление.',
      fields:[num('hr','Частота сердечных сокращений, уд/мин',10,300,{integer:true}),num('sbp','Систолическое давление, мм рт. ст.',20,300,{integer:true})],
      sources:[source('Руководство по травме живота у взрослых, 2025 · индекс шока','https://www.moh.gov.my/images/04-penerbitan/penerbitan-klinikal/panduan-amalan-klinikal/CPG_Abdominal_Trauma.pdf')],
      compute(v) {
        const score = v.hr / v.sbp;
        return result(fmt(score), score >= 0.9 ? 'Достиг ориентировочного порога 0,9, используемого при оценке больных с травмой.' : 'Ниже ориентировочного порога 0,9. Клинически значимая гипоперфузия всё ещё возможна.',
          'Повторите измерения и оцените признаки гипоперфузии и кровотечения. β-блокаторы, аритмии и электрокардиостимуляция могут изменить ответ частоты пульса.');
      }
    }
  ];
})();
