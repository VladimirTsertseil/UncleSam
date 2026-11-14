(() => {
  const prop = 'https://bbraun.ru/catalog_files/documents/_202306270605347723530_v6.0_19%20endg%2012610108.pdf';
  const fent = 'https://api.endopharm.ru/upload/iblock/fb8/2ct4llk3egzx7z9an1mj6r4kvu6vphsq.pdf';
  const fentWeight = 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/019101s074lbl.pdf';
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
  const original = () => ({
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
  function fresh() {
    const data = original();
    data.version = 2;
    const [propofol, fentanyl, rocuronium, ketamine] = data.drugs;
    propofol.doses[0].value = '1,5';
    propofol.doses[1].value = '1';
    propofol.doses[2].value = '4';
    propofol.doses[2].note += ' В шаблоне выбрана нижняя граница диапазона.';
    fentanyl.doses.push(
      dose('fent-weight','Весовой ориентир · низкая доза','2','мкг/кг',
        'Низкая доза из американской инструкции для применения как компонента общей анестезии. Российская инструкция «Эндофарм» указывает 100–200 мкг суммарно при вводной анестезии.',fentWeight),
      dose('fent-reduced','Пример сниженной дозы','1','мкг/кг',
        'Редактируемое значение шаблона, половина ориентира 2 мкг/кг. Инструкция указывает снижать начальную дозу у пожилых с учётом индивидуальной реакции.',fentWeight),
      dose('fent-lean','Стартовый пример по тощей массе','1','мкг/кг',
        'Редактируемый пример по тощей массе. ФАР указывает тип массы для пересчёта.',obesity)
    );
    ketamine.doses.push(dose('ket-low','Нижняя граница диапазона для индукции','1','мг/кг',
      'По инструкции «Эндофарм»: 1–4,5 мг/кг при прерывистом внутривенном введении. Выбор и титрование зависят от гемодинамики и сопутствующих препаратов.',ket),
      dose('ket-maint','Поддержание кетамином','10','мкг/кг/мин',
        'Нижняя граница 10–45 мкг/кг/мин по инструкции «Эндофарм» для кетамина как единственного анестезирующего компонента. Скорость титруют по эффекту.',ket));
    const use = (row, ref) => ({
      ...row, unit: ref.unit, value: ref.value,
      cUnit: ref.unit.startsWith('мкг') ? 'мкг' : 'мг', preset: ref.id
    });
    const [standard, older, reserve, obese, rsi] = data.scenarios;
    standard.note += ' Начальные значения редактируются. Пропофол титруют по эффекту.';
    standard.induction = [
      use(standard.induction[0],propofol.doses[0]), use(standard.induction[1],fentanyl.doses[1]),
      use(standard.induction[2],rocuronium.doses[0])
    ];
    standard.maintenance = [use(standard.maintenance[0],propofol.doses[2])];
    older.induction = [
      use(older.induction[0],propofol.doses[1]),use(older.induction[1],fentanyl.doses[2]),
      use(older.induction[2],rocuronium.doses[0])
    ];
    older.maintenance = [use(older.maintenance[0],propofol.doses[2])];
    reserve.note = 'Пример расчёта кетамина при уже выбранном врачом гипнотике. При выраженной нестабильности требуется индивидуальный план индукции.';
    reserve.induction = [use(blank('ket'),ketamine.doses[1])];
    reserve.method = 'tiva';
    reserve.maintenance = [use(blank('ket'),ketamine.doses[2])];
    obese.induction = [
      use(obese.induction[0],propofol.doses[0]),use(obese.induction[1],fentanyl.doses[3]),
      use(obese.induction[2],rocuronium.doses[0])
    ];
    obese.method = 'tiva';
    obese.maintenance = [use(blank('prop','мг/кг/ч','','ФАР указывает фактическую массу для поддержания пропофолом. Введи выбранную расчётную массу и титруй по эффекту.',true),propofol.doses[2])];
    rsi.note = 'Пример для гемодинамически стабильного взрослого при уже выбранной быстрой последовательной индукции. Особые группы — см. инструкцию к рокуронию.';
    rsi.induction = [use(blank('prop'),propofol.doses[0]),use(rsi.induction[1],rocuronium.doses[1])];
    rsi.method = 'tiva';
    rsi.maintenance = [use(blank('prop'),propofol.doses[2])];
    return data;
  }
  function upgrade(saved) {
    if (saved.version === 2) return saved;
    const old = original();
    const current = fresh();
    const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    const standardNames = new Set(saved.drugs
      .filter(d => old.drugs.some(originalDrug => originalDrug.id === d.id && originalDrug.name === d.name))
      .map(d => d.id));
    return {
      version: 2,
      drugs: saved.drugs.map(drug => {
        const originalDrug = old.drugs.find(d => d.id === drug.id);
        return same(drug, originalDrug) ? current.drugs.find(d => d.id === drug.id) : drug;
      }),
      scenarios: saved.scenarios.map(scenario => {
        const originalScenario = old.scenarios.find(s => s.id === scenario.id);
        const replacement = current.scenarios.find(s => s.id === scenario.id);
        if (!replacement || !same(scenario, originalScenario)) return scenario;
        return [...replacement.induction, ...replacement.maintenance].every(row => standardNames.has(row.drug))
          ? replacement : scenario;
      })
    };
  }
  globalThis.AnesthesiaCatalog = { fresh, upgrade, blank, plan };
})();
