(() => {
  const prop = 'https://bbraun.ru/catalog_files/documents/_202306270605347723530_v6.0_19%20endg%2012610108.pdf';
  const fent = 'https://api.endopharm.ru/upload/iblock/fb8/2ct4llk3egzx7z9an1mj6r4kvu6vphsq.pdf';
  const roc = 'https://www.msdmed.ru/instruction/instrukcziya-po-mediczinskomu-primeneniyu-lekarstvennogo-preparata-esmeron/';
  const ket = 'https://api.endopharm.ru/upload/iblock/7ea/ts34cmx8kho6jbx8mc83mcx0ox4715vi.pdf';
  const obesity = 'https://intensive-care.ru/index.php/acc/article/download/230/2362?inline=1';
  const dose = (id, name, value, unit, note, source) => ({ id, name, value, unit, note, source });
  const concentration = (value, unit) => ({ value, unit });
  const blank = (drug = null, unit = 'мг/кг', value = '', note = '', weightRequired = false) => ({
    drug, label: '', unit, value, preparation: 'direct', cUnit: unit.startsWith('мкг') ? 'мкг' : 'мг',
    concentration: '', quantity: '', volume: '', reverse: false, weight: '', weightRequired, note, preset: ''
  });
  const plan = (id, name, note, induction, maintenance = [], method = 'none') =>
    ({ id, name, note, induction, maintenance, method, gas: '' });
  const fresh = () => ({
    version: 1,
    drugs: [
      { id: 'prop', name: 'Пропофол', concentrations: [concentration('10','мг'), concentration('20','мг')], doses: [
        dose('prop-adult','Индукция у взрослых до 55 лет','', 'мг/кг','1,5–2,5 мг/кг суммарно, титровать по эффекту.',prop),
        dose('prop-older','Сниженная доза при индукции','', 'мг/кг','Старше 55 лет или III–IV класс физического статуса по ASA. Суммарная доза может быть снижена примерно до 1 мг/кг. Вводить медленнее, титровать по эффекту.',prop),
        dose('prop-maint','Поддержание общей анестезии у взрослых','', 'мг/кг/ч','4–12 мг/кг/ч по инструкции. Скорость подбирают по эффекту с учётом возраста, состояния и других препаратов.',prop)
      ] },
      { id: 'fent', name: 'Фентанил', concentrations: [concentration('50','мкг')], doses: [
        dose('fent-ind','Вводная анестезия','', 'мкг','100–200 мкг суммарно по инструкции «Эндофарм». Подбирать с учётом возраста, состояния и сопутствующих препаратов.',fent)
      ] },
      { id: 'roc', name: 'Рокуроний', concentrations: [concentration('10','мг')], doses: [
        dose('roc-standard','Обычная эндотрахеальная интубация','0,6','мг/кг','Стандартная интубационная доза по инструкции к Эсмерону.',roc),
        dose('roc-rsi','Быстрая последовательная индукция','1','мг/кг','Доза по инструкции к Эсмерону. При ожидаемом продлении блока и при кесаревом сечении инструкция приводит отдельные дозы.',roc),
        dose('roc-repeat','Поддерживающий болюс','0,15','мг/кг','Стандартная доза по инструкции. При длительной ингаляционной анестезии и у отдельных групп дозу снижают. Ориентироваться на мониторинг нервно-мышечной проводимости.',roc),
        dose('roc-tiva','Инфузия при внутривенной анестезии','', 'мг/кг/ч','0,3–0,6 мг/кг/ч при непрерывном мониторинге нервно-мышечной проводимости.',roc),
        dose('roc-gas','Инфузия при ингаляционной анестезии','', 'мг/кг/ч','0,3–0,4 мг/кг/ч при непрерывном мониторинге нервно-мышечной проводимости.',roc)
      ] },
      { id: 'ket', name: 'Кетамин', concentrations: [concentration('50','мг')], doses: [
        dose('ket-ind','Прерывистое внутривенное введение при индукции','', 'мг/кг','1–4,5 мг/кг по инструкции «Эндофарм». Дозу подбирают индивидуально.',ket)
      ] },
      { id: 'eto', name: 'Этомидат', concentrations: [], doses: [] }
    ],
    scenarios: [
      plan('standard','Стабильный взрослый','Плановая анестезия с интубацией трахеи.',[blank('prop'),blank('fent','мкг'),blank('roc')],[blank('prop','мг/кг/ч')],'tiva'),
      plan('older','Пожилой или ослабленный пациент','Титруйте гипнотик и подбирайте дозу опиоида с учётом состояния и сопутствующих препаратов.',[blank('prop'),blank('fent','мкг'),blank('roc')],[blank('prop','мг/кг/ч')],'tiva'),
      plan('reserve','Ограниченный гемодинамический резерв','Выберите препараты и дозы с учётом гемодинамики.',[blank()]),
      { ...plan('obesity','Морбидное ожирение','Ориентиры ФАР по расчётной массе указаны в строках. Введите расчётную массу для каждого препарата.',[
        blank('prop','мг/кг','','Тощая масса тела для индукции.',true),
        blank('fent','мкг/кг','','Тощая масса тела при расчёте в мкг/кг.',true),
        blank('roc','мг/кг','','Идеальная или тощая масса тела.',true)
      ]), source: obesity },
      plan('rsi','Быстрая последовательная индукция','Выберите гипнотик и интубационную дозу с учётом клинической ситуации.',[
        blank(),blank('roc')
      ])
    ]
  });
  globalThis.AnesthesiaCatalog = { fresh, blank, plan };
})();
