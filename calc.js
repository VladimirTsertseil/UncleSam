(() => {
  const units = Object.fromEntries(
    ['мг', 'мкг'].flatMap((mass, index) =>
      ['', '/кг'].flatMap(weight =>
        ['', '/ч', '/мин'].map(time => [
          mass + weight + time,
          { mass, weight: Boolean(weight), time: Boolean(time),
            factor: (index ? 1 : 1000) * (time === '/мин' ? 60 : 1) }
        ])
      )
    )
  );
  const number = value => {
    const input = String(value ?? '').trim();
    if (!/^\d+(?:[.,]\d+)?$/.test(input) && !/^[.,]\d+$/.test(input)) return null;
    const parsed = Number(input.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const calculate = (row, patientWeight) => {
    const unit = units[row.unit];
    const weight = number(row.weight?.trim() ? row.weight : patientWeight);
    const value = number(row.value);
    const cValue = number(row.concentration);
    const quantity = number(row.quantity);
    const volume = number(row.volume);
    const cScale = row.cUnit === 'мг' ? 1000 : 1;
    const rawConcentration = row.preparation === 'mix'
      ? quantity && volume && quantity / volume : cValue;
    const concentration = rawConcentration && rawConcentration * cScale;
    const result = { value, weight, concentration, rawConcentration };
    if (!unit || !value || (unit.weight && !weight)) return result;
    const factor = unit.factor * (unit.weight ? weight : 1);
    const massScale = unit.mass === 'мг' ? 1000 : 1;
    if (row.reverse && unit.time) {
      if (concentration) {
        result.amount = value * concentration / massScale;
        result.answer = value * concentration / factor;
      }
    } else {
      const amount = value * factor;
      result.amount = amount / massScale;
      if (concentration) result.answer = amount / concentration;
    }
    return result;
  };
  globalThis.AnesthesiaMath = { units, number, calculate };
})();
