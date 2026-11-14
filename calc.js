(() => {
  const scales = { 'мг':1000, 'мкг':1, 'ммоль':1 };
  const dimension = unit => unit === 'ммоль' ? 'ммоль' : 'mass';
  const units = Object.fromEntries(
    Object.keys(scales).flatMap(mass =>
      ['', '/кг'].flatMap(weight =>
        ['', '/ч', '/мин'].map(time => [
          mass + weight + time,
          { mass, weight: Boolean(weight), time: Boolean(time),
            factor: scales[mass] * (time === '/мин' ? 60 : 1) }
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
    const cScale = scales[row.cUnit];
    const rawConcentration = row.preparation === 'mix'
      ? quantity && volume && quantity / volume : cValue;
    const concentration = unit && dimension(unit.mass) === dimension(row.cUnit)
      ? rawConcentration && rawConcentration * cScale : null;
    const result = { value, weight, concentration, rawConcentration };
    if (!unit || !value || (unit.weight && !weight)) return result;
    const factor = unit.factor * (unit.weight ? weight : 1);
    const massScale = scales[unit.mass];
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
  globalThis.AnesthesiaMath = { units, number, calculate, scales, dimension };
})();
