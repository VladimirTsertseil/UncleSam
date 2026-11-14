(() => {
  const weightMinute = 'мкг/кг/мин';
  const weightHour = 'мкг/кг/ч';
  const mgHour = 'мг/кг/ч';
  const septic = 'https://base.garant.ru/411222865/';
  const chf = 'https://doi.org/10.15829/1560-4071-2024-6162';
  const prop = 'https://bbraun.ru/catalog_files/documents/_202306270605347723530_v6.0_19%20endg%2012610108.pdf';
  const roc = 'https://www.msdmed.ru/instruction/instrukcziya-po-mediczinskomu-primeneniyu-lekarstvennogo-preparata-esmeron/';
  const ket = 'https://api.endopharm.ru/upload/iblock/7ea/ts34cmx8kho6jbx8mc83mcx0ox4715vi.pdf';
  const dose = (id, name, unit, note, source, value = '') => ({ id, name, unit, note, source, value });
  const drug = (id, name, group, doses) => ({ id, name, group, doses, concentrations: [] });
  const anesthesia = 'Поддержание и анальгезия';
  const sedation = 'Седация';
  const pressure = 'Гемодинамика';
  const blockade = 'Миорелаксация';
  const entries = [
    drug('prop','Пропофол',anesthesia, [
      dose('inf-prop-anesthesia','Поддержание общей анестезии',mgHour,'4–12 мг/кг/ч. Титровать по глубине анестезии и гемодинамике.',prop),
      dose('inf-prop-sedation','Седация при процедурах',mgHour,'1,5–4,5 мг/кг/ч у большинства взрослых.',prop),
      dose('inf-prop-icu','Седация в отделении интенсивной терапии на ИВЛ',mgHour,'0,3–4 мг/кг/ч.',prop)
    ]),
    drug('remi','Ремифентанил',anesthesia, [
      dose('inf-remi-prop','Поддержание общей анестезии с пропофолом на ИВЛ',weightMinute,'Начальная скорость 0,25 мкг/кг/мин, диапазон 0,05–2 мкг/кг/мин. Зарубежная инструкция Ultiva, схема с пропофолом.', 'https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/9110/characteristic','0,25')
    ]),
    drug('fent','Фентанил',anesthesia, [
      dose('inf-fent-tiva','Компонент тотальной внутривенной анестезии',weightHour,'1–2 мкг/кг/ч при планируемой послеоперационной управляемой вентиляции. Зарубежный справочник Compass Health.', 'https://www.compasshcc.org/filesimages/Initiatives/SHARP/Resources.SH/Compass%20SHARP_%20Opioid%20Medication%20Dictionary.pdf'),
      dose('inf-fent-icu','Анальгезия в интенсивной терапии',weightHour,'0,7–5 мкг/кг/ч по справочнику Clinical Excellence Commission (Австралия).', 'https://cec.health.nsw.gov.au/therapeutics-safety/continuous-infusions/adult/fentanyl')
    ]),
    drug('ket','Кетамин',anesthesia, [
      dose('inf-ket-anesthesia','Поддержание при применении кетамина как единственного анестетика',weightMinute,'10–45 мкг/кг/мин по инструкции «Эндофарм».',ket)
    ]),
    drug('dex','Дексмедетомидин',sedation, [
      dose('inf-dex-icu','Седация взрослых в интенсивной терапии',weightHour,'0,2–1,4 мкг/кг/ч. В рекомендациях ФАР 0,7 мкг/кг/ч — начальная скорость при переводе пациента, который уже получает седацию и ИВЛ.', 'https://www.mediasphera.ru/issues/anesteziologiya-i-reanimatologiya/2023/5/1020175632023051006')
    ]),
    drug('mid','Мидазолам',sedation, [
      dose('inf-mid-combined','Седативный компонент комбинированной анестезии',mgHour,'0,03–0,1 мг/кг/ч. У пожилых и ослабленных пациентов инструкция предусматривает снижение дозы.', 'https://www.lsgeotar.ru/drugs/midazolam-BBMw')
    ]),
    drug('nor','Норадреналин',pressure, [
      dose('inf-nor-septic','Гипоперфузия при сепсисе у взрослых',weightMinute,'0,1–0,3 мкг/кг/мин — начальный диапазон по КР РФ «Сепсис (у взрослых)». Вводи количество норэпинефрина по действующему веществу согласно маркировке препарата.',septic)
    ]),
    drug('epi','Адреналин',pressure, [
      dose('inf-epi-septic','Гипотензия при септическом шоке у взрослых',weightMinute,'0,05–2 мкг/кг/мин с титрованием по среднему артериальному давлению. Инструкция США для внутривенной инфузии при этом показании.', 'https://www.dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=3b1ac82f-6920-4e40-a77e-598398679f2d&type=display')
    ]),
    drug('dop','Дофамин',pressure, [
      dose('inf-dop-septic','Гемодинамическая поддержка при сепсисе',weightMinute,'Старт 2–10 мкг/кг/мин, диапазон 2–20 мкг/кг/мин по таблице российских КР. Первой линией при септической гипоперфузии служит норадреналин.',septic)
    ]),
    drug('dob','Добутамин',pressure, [
      dose('inf-dob-hf','Инотропная поддержка при острой декомпенсации сердечной недостаточности',weightMinute,'2–20 мкг/кг/мин по таблице КР «Хроническая сердечная недостаточность».',chf)
    ]),
    drug('phen','Фенилэфрин',pressure, [
      dose('inf-phen-instruction','Артериальная гипотензия · инфузия по инструкции «Мезатон»','мкг/мин','Начальная скорость 180 мкг/мин с последующим снижением до 30–60 мкг/мин. Суммарная скорость без пересчёта на массу, по инструкции конкретного препарата.', 'https://www.lsgeotar.ru/drugs/mezaton-AGoS')
    ]),
    drug('nitro','Нитроглицерин',pressure, [
      dose('inf-nitro-instruction','Внутривенная инфузия через несорбирующую систему','мкг/мин','Начальная скорость 5 мкг/мин с титрованием по клиническому эффекту. Инструкция США к инъекционному нитроглицерину.', 'https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=9453bd8b-5d54-5dc8-e053-2995a90a95b2','5')
    ]),
    drug('roc','Рокуроний',blockade, [
      dose('inf-roc-tiva','Миорелаксация при внутривенной общей анестезии',mgHour,'0,3–0,6 мг/кг/ч. Титровать по количественному контролю нервно-мышечной проводимости.',roc),
      dose('inf-roc-inhalation','Миорелаксация при ингаляционной анестезии',mgHour,'0,3–0,4 мг/кг/ч по инструкции к Эсмерону.',roc)
    ]),
    drug('cis','Цисатракурий',blockade, [
      dose('inf-cis-maintain','Поддержание нервно-мышечного блока',weightMinute,'1–2 мкг/кг/мин после стабилизации блока. Ориентироваться на количественный мониторинг.', 'https://www.lsgeotar.ru/drugs/cisatracurium-besilate-evo-BBkB')
    ]),
    drug('atra','Атракурий',blockade, [
      dose('inf-atra-maintain','Поддержание нервно-мышечного блока',mgHour,'0,3–0,6 мг/кг/ч при длительных вмешательствах. Ориентироваться на количественный мониторинг.', 'https://www.rlsnet.ru/active-substance/atrakuriya-bezilat-1004')
    ])
  ];
  const ukka = 'https://www.ukkidney.org/sites/default/files/FINAL%20VERSION%20-%20UKKA%20CLINICAL%20PRACTICE%20GUIDELINE%20-%20MANAGEMENT%20OF%20HYPERKALAEMIA%20IN%20ADULTS%20-%20191223.pdf';
  const asra = 'https://rapm.bmj.com/content/rapm/early/2020/11/04/rapm-2020-101986.full.pdf';
  const reference = (id, name, note, source) => ({ ...dose(id, name, 'мг', note, source), referenceOnly:true });
  const electrolytes = 'Электролиты и кислотно-основное состояние';
  const additions = [
    drug('metoprolol','Метопролол',pressure, [
      { ...dose('metoprolol-svt','Наджелудочковая тахикардия · Беталок в/в','мг',
        'В инструкции начальная доза 5 мг со скоростью 1–2 мг/мин. Решение о повторном введении зависит от ЭКГ, давления, ЧСС и противопоказаний.',
        'https://www.rlsnet.ru/drugs/betalok-532','5'), referenceOnly:true }
    ]),
    drug('kcl','Калия хлорид',electrolytes, [
      dose('kcl-replacement','Коррекция гипокалиемии · пример ограничения из инструкции','ммоль/ч',
        'По инструкции DailyMed к концентрату: при калии сыворотки выше 2,5 ммоль/л скорость не выше 10 ммоль/ч, концентрация до 40 ммоль/л. Концентрат вводят только после разведения, без болюса. Подбор зависит от калия, функции почек, доступа и локального протокола.',
        'https://dailymed.nlm.nih.gov/dailymed/downloadpdffile.cfm?setId=46c162d4-0af9-4d14-8781-941a9117428c')
    ]),
    drug('calcium-chloride','Кальция хлорид',electrolytes, [
      reference('cacl-ukka','Гиперкалиемия с изменениями ЭКГ · при остановке кровообращения или угрозе остановки',
        'UK Kidney Association: 10 мл 10% препарата, содержащих 6,8 ммоль кальция, в/в за 5 минут. Сверь содержание элементарного кальция по маркировке: гидрат и состав ампулы могут отличаться. Кальций стабилизирует миокард, концентрацию калия снижают другими средствами.',ukka)
    ]),
    drug('calcium-gluconate','Кальция глюконат',electrolytes, [
      reference('caglu-ukka','Гиперкалиемия с изменениями ЭКГ · вне остановки и угрозы остановки кровообращения',
        'UK Kidney Association: 30 мл 10% раствора (около 6,8 ммоль кальция) в/в за 10 минут. Сверь содержание элементарного кальция по маркировке. Кальция хлорид и глюконат отличаются количеством кальция на мл.',ukka),
      reference('caglu-hypocalcemia','Острая гипокальциемия · инструкция к раствору 100 мг/мл',
        'Для взрослых в инструкции указано 5–10 мл. Внутривенное введение медленное или капельное. Дозу подбирают по клинической картине и кальцию.',
        'https://www.lsgeotar.ru/drugs/calcium-gluconate-BBcq')
    ]),
    drug('bicarbonate','Натрия гидрокарбонат',electrolytes, [
      dose('bicarb-acidosis','Коррекция метаболического ацидоза · 8,4%','ммоль/ч',
        '8,4% соответствует 1 ммоль/мл. В инструкции B. Braun ориентировочное количество в ммоль = дефицит оснований (положительная величина, ммоль/л) × масса (кг) × 0,2. Это суммарное количество, скорость вводится отдельно по назначению. Коррекцию уточняют по газам крови.',
        'https://www.medicines.org.uk/emc/product/15216/smpc')
    ]),
    drug('lipid20','Липидная эмульсия 20%','Неотложные состояния', [
      reference('last-call','LAST · системная токсичность местных анестетиков',
        'Прекрати введение местного анестетика, позови помощь, обеспечь дыхательные пути, оксигенацию и вентиляцию. Рассмотри раннее введение 20% эмульсии. При судорогах предпочтителен бензодиазепин.',asra),
      reference('last-under','Старт · масса меньше 70 кг',
        'Болюс около 1,5 мл/кг за 2–3 минуты, затем инфузия около 0,25 мл/кг/мин (15 мл/кг/ч).',asra),
      reference('last-over','Старт · масса больше 70 кг',
        'Болюс около 100 мл за 2–3 минуты, затем около 250 мл за 15–20 минут. У границы 70 кг проверь локальный алгоритм, в оригинальной памятке порог обозначен как «меньше» и «больше».',asra),
      reference('last-unstable','Если гемодинамика остаётся нестабильной',
        'Повтори болюс и удвой скорость инфузии. После стабилизации продолжай инфузию более 15 минут. Общая доза эмульсии не должна превышать 12 мл/кг.',asra),
      reference('last-resus','Особенности реанимации и наблюдение',
        'При необходимости адреналина ASRA рекомендует начинать с дозы менее 1 мкг/кг. Избегай вазопрессина, бета-блокаторов, блокаторов кальциевых каналов и местных анестетиков. Наблюдение после судорог — 2 ч, после сердечно-сосудистой нестабильности — 4–6 ч, после остановки кровообращения — по клинической ситуации.',asra)
    ]),
    drug('ephedrine','Эфедрин',pressure, [
      reference('ephedrine-hypotension','Значимая гипотензия во время анестезии · AKOVAZ',
        'По инструкции США начальный в/в болюс 5–10 мг. Титровать по артериальному давлению.',
        'https://www.accessdata.fda.gov/drugsatfda_docs/label/2020/208289s005lbl.pdf')
    ]),
    drug('ondansetron','Ондансетрон','Профилактика тошноты и рвоты', [
      reference('ondansetron-ponv','Профилактика послеоперационной тошноты и рвоты у взрослых',
        'Инструкция США: 4 мг в/в, вводить не менее 30 секунд, предпочтительно за 2–5 минут. Учитывай риск удлинения QT.',
        'https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=729d865f-d84a-495e-9456-4bceebb6e03f&type=pdf')
    ])
  ];
  function addInfusionCatalog(settings) {
    if (settings.version === 4) return settings;
    const drugs = structuredClone(settings.drugs);
    for (const entry of settings.version === 3 ? additions : [...entries, ...additions]) {
      const existing = drugs.find(drug => drug.id === entry.id);
      if (!existing && ['prop','fent','ket','roc'].includes(entry.id)) continue;
      if (!existing) {
        drugs.push(structuredClone(entry));
        continue;
      }
      existing.group ||= entry.group;
      const ids = new Set(existing.doses.map(dose => dose.id));
      existing.doses.push(...structuredClone(entry.doses.filter(dose => !ids.has(dose.id))));
    }
    return { ...settings, drugs, version: 4 };
  }
  globalThis.addInfusionCatalog = addInfusionCatalog;
})();
