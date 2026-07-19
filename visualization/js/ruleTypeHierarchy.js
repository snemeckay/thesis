/**
 * Rule Type Hierarchy
 * 
 * Defines a structured hierarchy of constraint template types used in process mining.
 * This makes it easier for non-experts to understand and navigate the different constraint categories.
 */

/**
 * Complete hierarchy of rule types grouped by semantic category
 */
export const RULE_TYPE_HIERARCHY = {
  unary: {
    label: "Activity Existence Patterns",
    description: "Constraints about how often an individual activity should occur in a case",
    shortDescription: "When/how often activities occur",
    info: `These constraints describe expectations about individual activities: 
whether they must appear, how many times they should appear, or when they typically occur in a process.`,
    children: {
      existence: {
        label: "Existence",
        description: "Activity is expected to occur in a case",
        info: `Indicates that an activity should appear in every case execution.`
      },
      absence: {
        label: "Absence",
        description: "Activity is not expected to occur in a case",
        info: `Indicates that an activity should rarely or never appear in a case.`
      },
      exactly_one: {
        label: "Exactly Once",
        description: "Activity must occur once in every case",
        info: `Indicates that an activity should appear one time per case.`
      },
      init: {
        label: "Initialization",
        description: "Activity is often observed at the start of a case",
        info: `Indicates that an activity frequently appears as the first activity in a process execution. 
This is useful for identifying typical entry points into a process.`
      },
      end: {
        label: "End",
        description: "Activity is often observed at the end of a case",
        info: `Indicates that an activity frequently appears as the last activity in a process execution. 
This is useful for identifying typical process completion points.`
      }
    }
  },
  
  binary_ordering: {
    label: "Activity Ordering Patterns",
    description: "Constraints about the sequence and relative order of two activities",
    shortDescription: "Ordering relationships between activities",
    info: `These constraints describe how two activities should be ordered relative to each other. 
They specify which activity should come first and whether they must be adjacent or can have other activities between them.`,
    children: {
      precedence: {
        label: "Precedence",
        description: "Activity B occurs only after Activity A has occurred",
        info: `If Activity B happens, Activity A must have happened before it (somewhere earlier in the case). 
Activity A can occur multiple times, and other activities can happen between them.`
      },
      response: {
        label: "Response",
        description: "After Activity A occurs, Activity B typically follows later",
        info: `If Activity A happens, then Activity B is expected to appear somewhere after it in the case. 
Other activities can occur between A and B. B can occur multiple times after each occurrence of A.`
      },
      succession: {
        label: "Succession",
        description: "Activities A and B form an ordered pair: A is followed by B, and B doesn't occur without A",
        info: `Combines precedence and response: whenever A occurs, B must follow; 
and whenever B occurs, A must have preceded it. This is a very strict ordering constraint.`
      },
      alternate_response: {
        label: "Alternate Response",
        description: "Each time A occurs, B must occur before A happens again",
        info: `Specifies that between any two consecutive occurrences of Activity A, 
Activity B must occur at least once. This creates an alternating pattern.`
      },
      alternate_precedence: {
        label: "Alternate Precedence",
        description: "Each B is preceded by an A, and no two B's share the same preceding A",
        info: `When Activity B occurs, it must be preceded by Activity A, 
and each A precedes at most one B. This creates a one-to-one matching pattern.`
      },
      alternate_succession: {
        label: "Alternate Succession",
        description: "A and B alternate: each A is followed by one B, and each B has a matching preceding A",
        info: `Combines alternate response and alternate precedence: 
A and B strictly alternate in matched pairs throughout the case.`
      },
      chain_response: {
        label: "Chain Response",
        description: "Activity B is expected to occur immediately after Activity A",
        info: `If Activity A occurs, then Activity B must be the very next activity. 
No other activities are allowed between them.`
      },
      chain_precedence: {
        label: "Chain Precedence",
        description: "Activity B is expected to be directly preceded by Activity A",
        info: `When Activity B occurs, Activity A must be immediately before it. 
No other activities are allowed between them.`
      },
      chain_succession: {
        label: "Chain Succession",
        description: "A and B occur directly next to each other in this order",
        info: `Specifies that A and B must be adjacent and in a specific order. 
They form a tight sequence where A is immediately followed by B, with no activities in between.`
      }
    }
  },
  
  binary_cooccurrence: {
    label: "Co-occurrence Patterns",
    description: "Constraints about whether two activities appear together or separately in a case",
    shortDescription: "Whether activities occur together or separately",
    info: `These constraints describe whether two activities tend to occur together in the same case, 
or whether they tend to be mutually exclusive or independent.`,
    children: {
      responded_existence: {
        label: "Responded Existence",
        description: "When A occurs, B usually appears somewhere in the case",
        info: `If Activity A happens in a case, Activity B is expected to appear somewhere in that same case. 
Unlike Response, B doesn't have to come after A—it can appear anywhere.`
      },
      coexistence: {
        label: "Coexistence",
        description: "Activities A and B tend to occur together in the same case",
        info: `If either Activity A or Activity B appears, the other is expected to appear as well. 
They tend to co-occur without a specific ordering requirement.`
      },
      choice: {
        label: "Choice",
        description: "A and B are connected as an either/or choice pattern",
        info: `At least one of Activity A or Activity B should occur in a case, 
but it's a flexible choice pattern rather than a strict exclusive choice.`
      },
      exclusive_choice: {
        label: "Exclusive Choice",
        description: "A and B tend to occur as alternatives—not both together",
        info: `Either Activity A or Activity B occurs in a case, but not both. 
They are mutually exclusive alternatives, often representing different paths through the process.`
      },
      not_coexistence: {
        label: "Not Coexistence",
        description: "Activities A and B usually do not occur together in a case",
        info: `If Activity A occurs in a case, Activity B is usually absent, and vice versa. 
This indicates that the activities are incompatible or represent conflicting process paths.`
      }
    }
  },
  
  negative_constraints: {
    label: "Negative/Forbidden Patterns",
    description: "Constraints about what should NOT happen or what negates expected patterns",
    shortDescription: "Things that typically should NOT occur",
    info: `These constraints specify patterns that are typically violated or avoided in correct process executions. 
They represent 'forbidden' or 'undesired' relationships between activities.`,
    children: {
      not_responded_existence: {
        label: "Not Responded Existence",
        description: "When A occurs, B is usually absent in the same case",
        info: `If Activity A happens, Activity B is expected to NOT appear in that case. 
This negates the responded existence constraint.`
      },
      not_response: {
        label: "Not Response",
        description: "After A occurs, B is usually not expected to follow",
        info: `If Activity A happens, Activity B should NOT occur later in the case. 
This is the opposite of the Response constraint.`
      },
      not_precedence: {
        label: "Not Precedence",
        description: "B usually occurs without prior A",
        info: `When Activity B occurs, it should NOT be preceded by Activity A. 
This is the opposite of the Precedence constraint.`
      },
      not_succession: {
        label: "Not Succession",
        description: "A and B usually do not form the ordered pair (A then B) in the same case",
        info: `The ordered sequence A followed by B should not occur. 
This is the opposite of the Succession constraint.`
      },
      not_chain_response: {
        label: "Not Chain Response",
        description: "After A occurs, B is usually not expected to happen immediately next",
        info: `Activity B should NOT immediately follow Activity A. 
This negates the Chain Response constraint.`
      },
      not_chain_precedence: {
        label: "Not Chain Precedence",
        description: "B is usually not expected to be directly preceded by A",
        info: `Activity A should NOT be immediately before Activity B. 
This negates the Chain Precedence constraint.`
      },
      not_chain_succession: {
        label: "Not Chain Succession",
        description: "A and B are usually not expected to occur directly next to each other",
        info: `Activities A and B should NOT be adjacent in the order A-B. 
This negates the Chain Succession constraint.`
      }
    }
  }
};

/**
 * Aliases used across dataset exports.
 * These normalize source-specific spellings and abbreviations to canonical keys.
 */
export const RULE_TYPE_ALIASES = {
  exactly: 'exactly_one',
  exactlyone: 'exactly_one',
  altresponse: 'alternate_response',
  altsuccession: 'alternate_succession',
  altprecedence: 'alternate_precedence',
  chainresponse: 'chain_response',
  chainprecedence: 'chain_precedence',
  chainsuccession: 'chain_succession',
  respondedexistence: 'responded_existence',
  exclusivechoice: 'exclusive_choice',
  notcoexistence: 'not_coexistence',
  notresponse: 'not_response',
  notprecedence: 'not_precedence',
  notsuccession: 'not_succession',
  notchainresponse: 'not_chain_response',
  notchainprecedence: 'not_chain_precedence',
  notchainsuccession: 'not_chain_succession'
};

/**
 * Flat map of all rule types for quick lookup
 */
export const RULE_TYPE_INDEX = (() => {
  const index = {};
  Object.values(RULE_TYPE_HIERARCHY).forEach(category => {
    Object.entries(category.children).forEach(([key, data]) => {
      index[key] = {
        ...data,
        categoryKey: category.label,
        categoryDescription: category.description
      };
    });
  });
  return index;
})();

/**
 * Get all rule types as a flat array
 */
export function getAllRuleTypes() {
  return Object.keys(RULE_TYPE_INDEX);
}

/**
 * Get metadata for a specific rule type
 */
export function getRuleTypeMetadata(ruleType) {
  if (!ruleType) return null;

  const normalized = normalizeRuleTypeKey(ruleType);
  return normalized ? RULE_TYPE_INDEX[normalized] || null : null;
}

export function normalizeRuleTypeKey(ruleType) {
  if (!ruleType) return null;
  const raw = String(ruleType).toLowerCase().trim().replace(/[\s-]+/g, '_');
  const compact = raw.replace(/_/g, '');

  if (RULE_TYPE_ALIASES[raw]) return RULE_TYPE_ALIASES[raw];
  if (RULE_TYPE_ALIASES[compact]) return RULE_TYPE_ALIASES[compact];

  for (const key of Object.keys(RULE_TYPE_INDEX)) {
    const keyLower = key.toLowerCase();
    if (keyLower === raw || keyLower === compact) return key;
  }

  for (const [key, metadata] of Object.entries(RULE_TYPE_INDEX)) {
    const label = String(metadata.label || '').toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/_/g, '');
    if (label === compact) return key;
  }

  return raw;
}

/**
 * Get category information for a specific rule type
 */
export function getRuleTypeCategory(ruleType) {
  const metadata = getRuleTypeMetadata(ruleType);
  if (!metadata) return null;
  
  return {
    key: metadata.categoryKey,
    description: metadata.categoryDescription,
    category: RULE_TYPE_HIERARCHY[Object.keys(RULE_TYPE_HIERARCHY).find(
      k => RULE_TYPE_HIERARCHY[k].label === metadata.categoryKey
    )]
  };
}

/**
 * Get a user-friendly description for a rule type
 */
export function describeRuleType(ruleType) {
  const metadata = getRuleTypeMetadata(ruleType);
  if (!metadata) return `Unknown constraint type: ${ruleType}`;
  
  return metadata.description || metadata.label;
}

/**
 * Get detailed info about a rule type
 */
export function getDetailedRuleTypeInfo(ruleType) {
  const metadata = getRuleTypeMetadata(ruleType);
  if (!metadata) return null;
  
  return metadata.info;
}

/**
 * Group rule types by their category
 */
export function groupRuleTypesByCategory(ruleTypes) {
  const grouped = {};
  
  ruleTypes.forEach(ruleType => {
    const category = getRuleTypeCategory(ruleType);
    if (category) {
      if (!grouped[category.key]) {
        grouped[category.key] = [];
      }
      grouped[category.key].push(ruleType);
    }
  });
  
  return grouped;
}

/**
 * Get hierarchy structure suitable for rendering as a tree
 */
export function getHierarchyForRendering(selectedRuleTypes = null) {
  const result = [];
  const normalizedSelection = selectedRuleTypes
    ? selectedRuleTypes.map((ruleType) => normalizeRuleTypeKey(ruleType)).filter(Boolean)
    : null;
  
  Object.entries(RULE_TYPE_HIERARCHY).forEach(([categoryKey, categoryData]) => {
    const childrenArray = Object.entries(categoryData.children).map(([ruleTypeKey, ruleTypeData]) => {
      const selected = !normalizedSelection || normalizedSelection.includes(ruleTypeKey);
      return {
        key: ruleTypeKey,
        label: ruleTypeData.label,
        description: ruleTypeData.description,
        info: ruleTypeData.info,
        selected,
        isLeaf: true
      };
    });
    
    result.push({
      key: categoryKey,
      label: categoryData.label,
      description: categoryData.description,
      shortDescription: categoryData.shortDescription,
      info: categoryData.info,
      children: childrenArray,
      isCategory: true,
      expanded: true
    });
  });
  
  return result;
}
