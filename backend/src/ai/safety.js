'use strict';

/**
 * Deterministic safety layer that runs BEFORE any language model.
 *
 * Some messages must never depend on a generative model's judgement:
 *  - urgent situations (falls, chest pain, being lost, self-harm);
 *  - medication or treatment questions (VAMORA must not give medical advice);
 *  - questions about whether Cara is a person (must be answered honestly).
 * Patterns cover English and common romanised Urdu. They are intentionally
 * broad: a false positive costs a gentle redirect; a false negative could
 * cost a person their safety. Coverage is limited and documented.
 */

const RULES = [
  {
    category: 'urgent',
    re: /\b(help me(?! (to )?(remember|recall|find|look|see|understand|with|think|know|choose|write|add|record))|please help|i need help|i('| a)?m (lost|scared|hurt)|i fell|i have fallen|fallen down|can'?t (breathe|get up)|chest pain|bleeding|emergency|kill myself|end my life|suicide|want to die|hurt myself|madad|bachao|gir gaya|gir gayi|kho gaya|kho gayi)\b/i,
    reply: (name) => `${name}, I am a computer helper and I can't come to you, but I have let the people helping you know that you asked for help. If you are hurt or in danger, please call emergency services (1122 in Pakistan) or ask someone near you right now.`,
    notifyCaregivers: true
  },
  {
    category: 'medical',
    re: /\b(dose|dosage|how many (pills|tablets)|should i take|can i take|stop taking|side effects?|overdose|medicine|medication|tablet|pill|dawai|dawa)\b/i,
    reply: (name) => `${name}, questions about medicine are important, so please ask your doctor or caregiver. I can show you your medicine list if your doctor has added it to VAMORA.`,
    notifyCaregivers: false
  },
  {
    category: 'identity',
    re: /\b(are you (a )?(real|human|person|robot|machine|computer|ai)|who are you|what are you|kya tum insaan|tum kaun ho)\b/i,
    reply: (name) => `I'm Cara, a computer helper inside VAMORA, not a person. I can help you look at your saved memories, ${name}. What would you like to remember?`,
    notifyCaregivers: false
  }
];

function classify(message) {
  for (const rule of RULES) if (rule.re.test(String(message))) return rule;
  return null;
}

module.exports = { classify, RULES };
