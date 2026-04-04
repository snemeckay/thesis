export function explainConstraintText(record) {
  const [a, b] = [record.activityA, record.activityB];
  const rawTemplate = String(record.template || record.rule_type || '').trim();
  const t = rawTemplate.toLowerCase().replace(/[\s-]+/g, '_');
  const compact = t.replace(/_/g, '');
  const cardinality = Number.isFinite(record.cardinality) ? record.cardinality : null;

  const map = {
    existence: () => cardinality
      ? `${a || 'This activity'} is expected to appear at least ${cardinality} time${cardinality === 1 ? '' : 's'} in a case.`
      : `${a || 'This activity'} is expected to appear in a case.`,
    absence: () => cardinality
      ? `${a || 'This activity'} is expected to appear at most ${Math.max(cardinality - 1, 0)} time${Math.max(cardinality - 1, 0) === 1 ? '' : 's'} in a case.`
      : `${a || 'This activity'} tends not to appear in a case.`,
    init: () => `${a || 'This activity'} is often observed at the start of a case.`,
    end: () => `${a || 'This activity'} is often observed at the end of a case.`,
    exactly: () => cardinality
      ? `${a || 'This activity'} is expected to occur exactly ${cardinality} time${cardinality === 1 ? '' : 's'} in a case.`
      : `${a || 'This activity'} is expected to occur an exact number of times in a case.`,
    exactlyone: () => `${a || 'This activity'} is expected to occur exactly once in a case.`,
    responded_existence: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} usually appears somewhere as well.`,
    response: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} usually follows later.`,
    precedence: () => `${b || 'Activity B'} usually appears only if ${a || 'activity A'} happened before it.`,
    succession: () => `${a || 'Activity A'} and ${b || 'activity B'} usually appear in an ordered pair: if ${a || 'A'} occurs then ${b || 'B'} follows later, and ${b || 'B'} does not appear unless ${a || 'A'} occurred before.`,
    altresponse: () => `Each time ${a || 'activity A'} happens, ${b || 'activity B'} is expected to occur before ${a || 'activity A'} happens again.`,
    alternate_response: () => `Each time ${a || 'activity A'} happens, ${b || 'activity B'} is expected to occur before ${a || 'activity A'} happens again.`,
    alternateprecedence: () => `${b || 'Activity B'} is expected to have a matching earlier ${a || 'activity A'}, and two ${b || 'activity B'} occurrences should not share the same preceding ${a || 'activity A'}.`,
    alternate_precedence: () => `${b || 'Activity B'} is expected to have a matching earlier ${a || 'activity A'}, and two ${b || 'activity B'} occurrences should not share the same preceding ${a || 'activity A'}.`,
    altsuccession: () => `${a || 'Activity A'} and ${b || 'activity B'} usually alternate in matched pairs: every ${a || 'A'} is followed by one ${b || 'B'} before the next ${a || 'A'}, and every ${b || 'B'} has a corresponding earlier ${a || 'A'}.`,
    alternate_succession: () => `${a || 'Activity A'} and ${b || 'activity B'} usually alternate in matched pairs: every ${a || 'A'} is followed by one ${b || 'B'} before the next ${a || 'A'}, and every ${b || 'B'} has a corresponding earlier ${a || 'A'}.`,
    chain_response: () => `After ${a || 'activity A'}, ${b || 'activity B'} is expected next.`,
    chain_precedence: () => `${b || 'Activity B'} is expected to be directly preceded by ${a || 'activity A'}.`,
    chainsuccession: () => `${a || 'Activity A'} and ${b || 'activity B'} are expected to occur directly next to each other in this order: ${a || 'A'} immediately followed by ${b || 'B'}.`,
    chain_succession: () => `${a || 'Activity A'} and ${b || 'activity B'} are expected to occur directly next to each other in this order: ${a || 'A'} immediately followed by ${b || 'B'}.`,
    choice: () => `${a || 'Activity A'} and ${b || 'activity B'} are connected as an either/or choice pattern.`,
    exclusive_choice: () => `${a || 'Activity A'} and ${b || 'activity B'} tend to occur as alternatives, not together.`,
    coexistence: () => `${a || 'Activity A'} and ${b || 'activity B'} tend to occur together.`,
    not_coexistence: () => `${a || 'Activity A'} and ${b || 'activity B'} usually do not occur together.`,
    not_response: () => `After ${a || 'activity A'}, ${b || 'activity B'} is usually not expected to follow.`,
    not_precedence: () => `${b || 'Activity B'} usually occurs without prior ${a || 'activity A'}.`,
    not_succession: () => `${a || 'Activity A'} and ${b || 'activity B'} usually do not form the ordered pair ${a || 'A'} then ${b || 'B'} in the same case.`,
    not_responded_existence: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} is often absent in the same case.`,
    not_chain_response: () => `After ${a || 'activity A'}, ${b || 'activity B'} is usually not expected to happen immediately next.`,
    not_chain_precedence: () => `${b || 'Activity B'} is usually not expected to be directly preceded by ${a || 'activity A'}.`,
    not_chain_succession: () => `${a || 'Activity A'} and ${b || 'activity B'} are usually not expected to occur directly next to each other in this order.`,
    respondedexistence: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} usually appears somewhere as well.`,
    altprecedence: () => `${b || 'Activity B'} is expected to have a matching earlier ${a || 'activity A'}, and two ${b || 'activity B'} occurrences should not share the same preceding ${a || 'activity A'}.`,
    altresponse: () => `Each time ${a || 'activity A'} happens, ${b || 'activity B'} is expected to occur before ${a || 'activity A'} happens again.`,
    altsuccession: () => `${a || 'Activity A'} and ${b || 'activity B'} usually alternate in matched pairs: every ${a || 'A'} is followed by one ${b || 'B'} before the next ${a || 'A'}, and every ${b || 'B'} has a corresponding earlier ${a || 'A'}.`,
    chainresponse: () => `After ${a || 'activity A'}, ${b || 'activity B'} is expected next.`,
    chainprecedence: () => `${b || 'Activity B'} is expected to be directly preceded by ${a || 'activity A'}.`,
    exclusivechoice: () => `${a || 'Activity A'} and ${b || 'activity B'} tend to occur as alternatives, not together.`,
    notcoexistence: () => `${a || 'Activity A'} and ${b || 'activity B'} usually do not occur together.`,
    noncoexistence: () => `${a || 'Activity A'} and ${b || 'activity B'} usually do not occur together.`,
    notresponse: () => `After ${a || 'activity A'}, ${b || 'activity B'} is usually not expected to follow.`,
    notprecedence: () => `${b || 'Activity B'} usually occurs without prior ${a || 'activity A'}.`,
    notrespondedexistence: () => `When ${a || 'activity A'} happens, ${b || 'activity B'} is often absent in the same case.`,
    notsuccession: () => `${a || 'Activity A'} and ${b || 'activity B'} usually do not form the ordered pair ${a || 'A'} then ${b || 'B'} in the same case.`,
    nonsuccession: () => `${a || 'activity A'} is usually not followed later by ${b || 'activity B'} in the same case.`,
    nonchainsuccession: () => `After ${a || 'activity A'}, ${b || 'activity B'} is usually not expected to happen immediately next.`
  };

  if (map[t]) return map[t]();
  if (map[compact]) return map[compact]();
  return `${a || 'This activity'} and ${b || 'the related activity'} are connected by the ${rawTemplate || 'selected'} constraint template.`;
}