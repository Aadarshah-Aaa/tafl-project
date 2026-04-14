/* ============================================================
   CFG NORMALIZER — Main JavaScript
   CFG → CNF → GNF with step-by-step explanations
   ============================================================ */

'use strict';

/**
 * Formal Theorems & Reasons for each transformation step
 */
const THEOREMS = {
    // CNF
    'Step 1 — New Start Symbol': {
        header: 'Requirement for CNF',
        theory: 'A new start symbol S₀ → S is added to ensure that the start symbol does NOT appear on the RHS of any production. This is essential for the construction of the CYK parsing algorithm and standard CNF definitions.'
    },
    'Step 2 — Eliminate ε-Productions': {
        header: 'The ε-Removal Theorem',
        theory: 'For every nullable variable A (A ⇒* ε), we find all productions containing A on the RHS and create new versions omitting it. This preserves the language while eliminating empty transitions, simplifying the grammar hierarchy.'
    },
    'Step 3 — Eliminate Unit Productions': {
        header: 'Transitive Closure Property',
        theory: 'Unit productions (A → B) create redundant derivation steps. We eliminate them by replacing A → B with A → γ for every non-unit production B → γ. This reduces the number of steps to derive a terminal string.'
    },
    'Step 4 — Eliminate Useless Symbols': {
        header: 'Symbol Reachability & Productivity',
        theory: 'Productions are only useful if they can reach a terminal string (Productivity) and are reachable from S (Reachability). Removing useless symbols reduces the grammar size without changing the language.'
    },
    'Step 5 — Binarize & Terminalize': {
        header: 'Normal Form Structural Rule',
        theory: 'CNF requires productions to be either A → BC (Binary) or A → a (Terminal). We replace terminals in mixed RHS with wrapper NTs and split RHS with length > 2 into binary pairs using substitution.'
    },
    // GNF
    'Step 1 — Order Non-Terminals': {
        header: 'Lexicographical Ordering',
        theory: 'Assigning an index A₁, A₂, ..., Aₙ allows us to systematically process variables and ensures we only have "forward" dependencies (Aᵢ → Aⱼγ where j > i) or terminal-leading rules.'
    },
    'Step 2 — Forward Substitution & Eliminate Left Recursion': {
        header: 'Left Recursion Lemma',
        theory: 'Left recursion (A → Aα) causes infinite loops in top-down parsers. We transform it into right recursion (A → βA\', A\' → αA\') which is compatible with Greibach Normal Form\'s terminal-first requirement.'
    },
    'Step 3 — Backward Substitution': {
        header: 'The GNF Construction',
        theory: 'By substituting the terminal-leading productions of Aⱼ (where j > i) into productions of Aᵢ, we eventually force every production to begin with a terminal symbol, which is the definition of GNF.'
    },
    'Final CNF Grammar': {
        header: 'Normal Form Achieved',
        theory: 'Every production is either A → BC or A → a. This structure is ideal for parsing algorithms like Cocke-Younger-Kasami (CYK).'
    },
    'Final GNF Grammar': {
        header: 'Greibach Form Achieved',
        theory: 'Every production starts with a terminal symbol. This form is particularly useful for Top-Down parsing and PDA constructions.'
    }
};

// ─────────────────────────────────────────────────────────────
//  EXAMPLES
// ─────────────────────────────────────────────────────────────
const EXAMPLES = [
    {
        label: 'Epsilon Productions',
        grammar: `S -> A B\nA -> a A | e\nB -> b B | b`
    },
    {
        label: 'Unit Productions',
        grammar: `S -> A | B\nA -> a A | a\nB -> b B | b`
    },
    {
        label: 'Mixed Grammar',
        grammar: `S -> a S b | A B\nA -> a A | a\nB -> b B | e`
    },
    {
        label: 'Left Recursion (GNF)',
        grammar: `S -> S a | A\nA -> a b | b`
    },
    {
        label: 'Complex Grammar',
        grammar: `S -> A B C\nA -> a A | e\nB -> b B | b\nC -> c | e`
    }
];

// ─────────────────────────────────────────────────────────────
//  DATA STRUCTURE
// ─────────────────────────────────────────────────────────────
// Grammar = { start: string, rules: Map<NT, string[][]> }
//   where string[][] means each production is an array of symbols
//   e.g. S -> A B | a  =>  rules.get('S') = [['A','B'], ['a']]
// Epsilon is represented as [] (empty array) or ['ε']

const EPSILON = 'ε';

function cloneGrammar(g) {
    const rules = new Map();
    for (const [k, prods] of g.rules) {
        rules.set(k, prods.map(p => [...p]));
    }
    return { start: g.start, rules };
}

function grammarToString(g) {
    // returns ordered productions as array of { lhs, rhs }
    const lines = [];
    const nts = [...g.rules.keys()];
    // Start symbol first
    const ordered = [g.start, ...nts.filter(n => n !== g.start)];
    for (const nt of ordered) {
        if (!g.rules.has(nt)) continue;
        const prods = g.rules.get(nt);
        for (const prod of prods) {
            lines.push({ lhs: nt, rhs: prod.length === 0 ? [EPSILON] : prod });
        }
    }
    return lines;
}

// ─────────────────────────────────────────────────────────────
//  PARSER
// ─────────────────────────────────────────────────────────────
function parseGrammar(text) {
    const rules = new Map();
    let startSymbol = null;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) throw new Error('Grammar is empty.');

    for (const line of lines) {
        if (!line.includes('->')) throw new Error(`Missing "->" in: "${line}"`);
        const [lhsPart, rhsPart] = line.split('->').map(s => s.trim());
        if (!/^[A-Z][A-Z0-9'₀₁₂₃₄₅₆₇₈₉]*$/.test(lhsPart)) {
            throw new Error(`Invalid non-terminal "${lhsPart}". Non-terminals must start with uppercase.`);
        }
        if (startSymbol === null) startSymbol = lhsPart;
        const alternatives = rhsPart.split('|').map(s => s.trim());
        const prods = [];
        for (const alt of alternatives) {
            if (alt === 'e' || alt === 'ε' || alt === 'eps' || alt === 'epsilon' || alt === '') {
                prods.push([]);  // epsilon
            } else {
                // Tokenize: split into symbols. Capital letter sequences = NT, else terminal
                const tokens = tokenize(alt);
                prods.push(tokens);
            }
        }
        if (!rules.has(lhsPart)) rules.set(lhsPart, []);
        rules.get(lhsPart).push(...prods);
    }

    // Deduplicate
    for (const [nt, prods] of rules) {
        const seen = new Set();
        rules.set(nt, prods.filter(p => {
            const key = p.join('§');
            if (seen.has(key)) return false;
            seen.add(key); return true;
        }));
    }

    return { start: startSymbol, rules };
}

function tokenize(str) {
    const tokens = [];
    let i = 0;
    while (i < str.length) {
        if (str[i] === ' ') { i++; continue; }
        if (/[A-Z]/.test(str[i])) {
            // Read full NT (uppercase letters, digits, subscripts, primes)
            let nt = '';
            while (i < str.length && /[A-Z0-9'₀₁₂₃₄₅₆₇₈₉]/.test(str[i])) {
                nt += str[i++];
            }
            tokens.push(nt);
        } else {
            tokens.push(str[i++]);
        }
    }
    return tokens;
}

function isNonTerminal(sym) {
    return /^[A-Z]/.test(sym);
}
function isTerminal(sym) {
    return !isNonTerminal(sym) && sym !== EPSILON;
}

// ─────────────────────────────────────────────────────────────
//  CNF TRANSFORMATION STEPS
// ─────────────────────────────────────────────────────────────

// Returns array of step objects: { name, description, grammar, changes }
function toCNF(original) {
    const steps = [];

    // Quick capture helper
    function capture(g, name, desc, changes = []) {
        steps.push({ name, description: desc, grammar: cloneGrammar(g), changes });
    }

    /* ── Step 0: Original grammar ── */
    capture(original, 'Original Grammar',
        '<strong>Input Grammar:</strong> This is your Context-Free Grammar (CFG) as entered.<br><strong>Next Steps:</strong> The following 5 transformations will convert this to Chomsky Normal Form.');

    let g = cloneGrammar(original);

    /* ── Step 1: New start symbol ── */
    const newStart = g.start + '₀';
    const oldStart = g.start;
    const newRules = new Map();
    newRules.set(newStart, [[oldStart]]);
    for (const [k, v] of g.rules) newRules.set(k, v.map(p => [...p]));
    g = { start: newStart, rules: newRules };
    capture(g, 'Step 1 — New Start Symbol',
        `<strong>Why:</strong> CNF requires that the start symbol never appears on the RHS.<br><strong>Action:</strong> Add new start symbol <strong>${newStart}</strong> with production <strong>${newStart} → ${oldStart}</strong><br><strong>Effect:</strong> The original start <strong>${oldStart}</strong> can now safely appear on RHS.<br><strong>Language:</strong> Preserved (same strings accepted).`,
        [{ type: 'added', text: `${newStart} → ${oldStart}` }]
    );

    /* ── Step 2: Eliminate ε-productions ── */
    g = eliminateEpsilon(g, steps);

    /* ── Step 3: Eliminate unit productions ── */
    g = eliminateUnitProductions(g, steps);

    /* ── Step 4: Eliminate useless symbols ── */
    g = eliminateUseless(g, steps);

    /* ── Step 5: Convert to proper CNF (binarize + terminals) ── */
    g = binarizeAndTerminalize(g, steps);

    /* ── Final ── */
    capture(g, 'Final CNF Grammar',
        '<strong>✓ Success!</strong> Grammar is now in Chomsky Normal Form (CNF)<br>' +
        '<strong>Properties:</strong><br>' +
        '• Every production is A → BC (binary non-terminals) or A → a (single terminal)<br>' +
        '• Start symbol does not appear on any RHS<br>' +
        '• No ε-rules (except possibly S₀ → ε if original was nullable)<br>' +
        '• No unit productions (A → B)<br>' +
        '• No useless symbols<br>' +
        '<strong>Applications:</strong> CYK parsing algorithm, formal language theory, automata equivalence proofs');

    return { steps, final: g };
}

// ── ε-elimination ──
function eliminateEpsilon(g, steps) {
    // Find nullable non-terminals
    const nullable = findNullable(g);
    const removedProds = [];
    const addedProds = [];

    if (nullable.size === 0 || (nullable.size === 1 && nullable.has(g.start))) {
        steps.push({
            name: 'Step 2 — Eliminate ε-Productions',
            description: '<strong>Observation:</strong> No ε-productions found (or only at start symbol).<br><strong>Action:</strong> Skip this step — already compliant with CNF requirement.',
            grammar: cloneGrammar(g),
            changes: [{ type: 'info', text: 'No ε-productions' }]
        });
        return g;
    }

    const g2 = cloneGrammar(g);

    for (const [nt, prods] of g2.rules) {
        const newProds = [];
        for (const prod of prods) {
            if (prod.length === 0) {
                // Remove ε-production (except for start symbol if needed)
                if (nt === g2.start) newProds.push(prod); // keep for start
                else removedProds.push(`${nt} → ε`);
                continue;
            }
            // Add all combinations omitting nullable symbols
            const combos = generateCombinations(prod, nullable);
            for (const c of combos) {
                const key = c.join('§');
                if (!newProds.some(p => p.join('§') === key)) {
                    newProds.push(c);
                    if (c.length < prod.length) {
                        addedProds.push(`${nt} → ${c.length === 0 ? EPSILON : c.join(' ')}`);
                    }
                }
            }
        }
        g2.rules.set(nt, newProds.filter(p => p.length > 0 || nt === g2.start));
    }

    // Remove ε from non-start rules final pass
    for (const [nt, prods] of g2.rules) {
        if (nt !== g2.start) {
            g2.rules.set(nt, prods.filter(p => p.length > 0));
        }
    }
    // Remove empty rule sets
    for (const [nt, prods] of g2.rules) {
        if (prods.length === 0) g2.rules.delete(nt);
    }

    const changes = [
        ...removedProds.map(t => ({ type: 'removed', text: t })),
        ...addedProds.map(t => ({ type: 'added', text: t }))
    ];
    if (changes.length === 0) changes.push({ type: 'info', text: 'No change needed' });

    steps.push({
        name: 'Step 2 — Eliminate ε-Productions',
        description: `<strong>Nullable Symbols:</strong> ${[...nullable].join(', ')}<br><strong>Process:</strong> For each production containing nullable symbols, generate all combinations (with/without each nullable).<br><strong>Example:</strong> If E → T U and T nullable → add E → U<br><strong>Then:</strong> Remove ε-rules. Language preserved.`,
        grammar: cloneGrammar(g2),
        changes
    });
    return g2;
}

function findNullable(g) {
    const nullable = new Set();
    // Direct ε
    for (const [nt, prods] of g.rules) {
        if (prods.some(p => p.length === 0)) nullable.add(nt);
    }
    // Indirect
    let changed = true;
    while (changed) {
        changed = false;
        for (const [nt, prods] of g.rules) {
            if (!nullable.has(nt)) {
                if (prods.some(p => p.length > 0 && p.every(s => nullable.has(s)))) {
                    nullable.add(nt); changed = true;
                }
            }
        }
    }
    return nullable;
}

function generateCombinations(prod, nullable) {
    const nullablePositions = prod.map((s, i) => nullable.has(s) ? i : -1).filter(i => i >= 0);
    const results = [];
    const n = nullablePositions.length;
    for (let mask = 0; mask < (1 << n); mask++) {
        const omit = new Set(nullablePositions.filter((_, bit) => !(mask & (1 << bit))));
        results.push(prod.filter((_, i) => !omit.has(i)));
    }
    // Remove duplicates, keep original (mask = all 1s)
    const seen = new Set();
    return results.filter(r => {
        const k = r.join('§');
        if (seen.has(k)) return false;
        seen.add(k); return true;
    });
}

// ── Unit production elimination ──
function eliminateUnitProductions(g, steps) {
    // Find all unit pairs (A, B) where A =>* B
    const removed = [];
    const added = [];
    let hasUnit = false;

    for (const [nt, prods] of g.rules) {
        if (prods.some(p => p.length === 1 && isNonTerminal(p[0]))) { hasUnit = true; break; }
    }

    if (!hasUnit) {
        steps.push({
            name: 'Step 3 — Eliminate Unit Productions',
            description: '<strong>Check:</strong> No unit productions found (no rule like A → B).<br><strong>Result:</strong> Grammar already satisfies this CNF requirement.',
            grammar: cloneGrammar(g),
            changes: [{ type: 'info', text: 'No unit productions' }]
        });
        return g;
    }

    const g2 = cloneGrammar(g);
    const nts = [...g2.rules.keys()];

    // Compute unit pairs via BFS for each NT
    for (const nt of nts) {
        const unitReach = new Set([nt]);
        const queue = [nt];
        while (queue.length) {
            const curr = queue.shift();
            const prods = g2.rules.get(curr) || [];
            for (const p of prods) {
                if (p.length === 1 && isNonTerminal(p[0]) && !unitReach.has(p[0])) {
                    unitReach.add(p[0]);
                    queue.push(p[0]);
                }
            }
        }
        unitReach.delete(nt);
        // Add all non-unit productions of reachable NTs
        for (const reachable of unitReach) {
            const rProds = g2.rules.get(reachable) || [];
            const currentProds = g2.rules.get(nt);
            for (const rp of rProds) {
                if (!(rp.length === 1 && isNonTerminal(rp[0]))) {
                    const key = rp.join('§');
                    if (!currentProds.some(p => p.join('§') === key)) {
                        currentProds.push([...rp]);
                        added.push(`${nt} → ${rp.join(' ')}`);
                    }
                }
            }
            // Remove unit transition nt -> reachable
            const before = g2.rules.get(nt).length;
            g2.rules.set(nt, g2.rules.get(nt).filter(p => !(p.length === 1 && p[0] === reachable)));
            if (g2.rules.get(nt).length < before) removed.push(`${nt} → ${reachable}`);
        }
    }

    const changes = [
        ...removed.map(t => ({ type: 'removed', text: t })),
        ...added.map(t => ({ type: 'added', text: t }))
    ];
    if (changes.length === 0) changes.push({ type: 'info', text: 'No change needed' });

    steps.push({
        name: 'Step 3 — Eliminate Unit Productions',
        description: '<strong>Unit Production:</strong> Any rule with exactly one non-terminal on RHS (e.g., A → B)<br><strong>Problem:</strong> Creates unnecessary derivation steps<br><strong>Solution:</strong> For each unit A → B, copy all non-unit productions of B into A<br><strong>Then:</strong> Remove the original unit production A → B<br><strong>Result:</strong> Shortest derivation paths, still generating same language',
        grammar: cloneGrammar(g2),
        changes
    });
    return g2;
}

// ── Useless symbol elimination ──
function eliminateUseless(g, steps) {
    const g2 = cloneGrammar(g);
    const removedStr = [];
    
    // 1) Find generating symbols
    const generating = new Set();
    for (const [nt, prods] of g2.rules) {
        if (prods.some(p => p.every(s => isTerminal(s)))) generating.add(nt);
    }
    let changed = true;
    while (changed) {
        changed = false;
        for (const [nt, prods] of g2.rules) {
            if (!generating.has(nt)) {
                if (prods.some(p => p.every(s => isTerminal(s) || generating.has(s)))) {
                    generating.add(nt); changed = true;
                }
            }
        }
    }

    // Remove non-generating NTs and limit productions
    for (const nt of [...g2.rules.keys()]) {
        if (!generating.has(nt)) {
            g2.rules.delete(nt);
            removedStr.push(`${nt} (non-generating)`);
        } else {
            const filteredProds = g2.rules.get(nt).filter(p => p.every(s => isTerminal(s) || generating.has(s)));
            g2.rules.set(nt, filteredProds);
        }
    }

    // 2) Find reachable symbols from the updated grammar
    const reachable = new Set([g2.start]);
    const queue = [g2.start];
    while (queue.length) {
        const curr = queue.shift();
        for (const prod of (g2.rules.get(curr) || [])) {
            for (const sym of prod) {
                if (isNonTerminal(sym) && !reachable.has(sym)) {
                    reachable.add(sym); queue.push(sym);
                }
            }
        }
    }

    // Remove unreachable NTs
    for (const nt of [...g2.rules.keys()]) {
        if (!reachable.has(nt)) {
            g2.rules.delete(nt);
            if (!removedStr.includes(`${nt} (non-generating)`)) {
                removedStr.push(`${nt} (unreachable)`);
            }
        }
    }

    if (removedStr.length === 0) {
        steps.push({
            name: 'Step 4 — Eliminate Useless Symbols',
            description: '<strong>Check:</strong> All non-terminals are <strong>generating</strong> (derive a terminal string) and <strong>reachable</strong> (from start symbol)<br><strong>Result:</strong> No useless symbols. Grammar is clean.',
            grammar: cloneGrammar(g2),
            changes: [{ type: 'info', text: 'No useless symbols' }]
        });
        return g2;
    }

    steps.push({
        name: 'Step 4 — Eliminate Useless Symbols',
        description: '<strong>Useless symbols removed:</strong> ' + removedStr.join(', ') + '<br><strong>Definition:</strong><br>• <strong>Non-generating:</strong> Cannot derive any terminal string<br>• <strong>Unreachable:</strong> Cannot be reached from start symbol<br><strong>Action:</strong> Delete these non-terminals and related productions<br><strong>Result:</strong> Reduced grammar, same language.',
        grammar: cloneGrammar(g2),
        changes: removedStr.map(t => ({ type: 'removed', text: t }))
    });
    return g2;
}

// ── Binarize & Terminalize ──
function binarizeAndTerminalize(g, steps) {
    const g2 = cloneGrammar(g);
    const termMap = new Map(); // terminal -> NT name
    const added = [];
    const nts = new Set(g2.rules.keys());

    // Helper: get or create terminal wrapper NT
    const termNames = ['X', 'Y', 'Z', 'W', 'V', 'U', 'R', 'P', 'Q'];
    let termNameIdx = 0;

    function getTermNT(terminal) {
        if (termMap.has(terminal)) return termMap.get(terminal);
        
        let name;
        while (termNameIdx < termNames.length) {
            name = termNames[termNameIdx++];
            if (!nts.has(name)) break;
            name = null;
        }

        if (!name) {
            // Pick a name: T_A, T_B, etc.
            name = 'T' + terminal.toUpperCase();
            // Avoid collision
            let suffix = 0;
            while (nts.has(name + (suffix || ''))) suffix++;
            name = name + (suffix || '');
        }

        termMap.set(terminal, name);
        nts.add(name);
        g2.rules.set(name, [[terminal]]);
        added.push(`${name} → ${terminal}`);
        return name;
    }

    // Counter for intermediate NTs
    let binCount = 0;
    const pairMap = new Map();

    function getOrCreateBinNT(sym1, sym2) {
        const key = `${sym1}§${sym2}`;
        if (pairMap.has(key)) return pairMap.get(key);

        let name = 'X' + (++binCount);
        while (nts.has(name)) name = 'X' + (++binCount);
        nts.add(name);
        
        g2.rules.set(name, [[sym1, sym2]]);
        added.push(`${name} → ${sym1} ${sym2}`);
        pairMap.set(key, name);

        return name;
    }

    for (const [nt, prods] of [...g2.rules.entries()]) {
        const newProds = [];
        for (const prod of prods) {
            if (prod.length === 0) { newProds.push(prod); continue; } // ε
            if (prod.length === 1) {
                // Must be a terminal
                if (isTerminal(prod[0])) { newProds.push(prod); continue; }
                // It's a single NT — this is unit prod, shouldn't exist, but keep
                newProds.push(prod); continue;
            }
            // Replace terminals in productions of length ≥ 2
            const replaced = prod.map(sym => {
                if (isTerminal(sym)) return getTermNT(sym);
                return sym;
            });
            // Binarize
            const binary = binarize(replaced, getOrCreateBinNT);
            newProds.push(binary);
        }
        g2.rules.set(nt, newProds);
    }

    const allAdded = added;
    steps.push({
        name: 'Step 5 — Binarize & Terminalize',
        description: '<strong>Final CNF requirement:</strong> Each production is either A → a (single terminal) or A → BC (two non-terminals)<br>' +
            '<strong>Step 5.1 — Terminalize:</strong> If A → a B C, wrap terminal a in new NT: W_a → a; then A → W_a B C<br>' +
            '<strong>Step 5.2 — Binarize:</strong> If A → B C D, chain binary rules: A → B X, X → C D<br>' +
            '<strong>Compaction:</strong> Reuse intermediate NTs for identical pairs (e.g., both B C encoded as one X₁)<br>' +
            '<strong>Result:</strong> Grammar now in strict  Chomsky Normal Form, ready for CYK parsing algorithm.',
        grammar: cloneGrammar(g2),
        changes: allAdded.map(t => ({ type: 'added', text: t }))
    });
    return g2;
}

function binarize(prod, getOrCreateBinNT) {
    if (prod.length <= 2) return prod;
    // Right-recursive binarization
    let rest = [...prod];
    while (rest.length > 2) {
        const last = rest.pop();
        const secondLast = rest.pop();
        const newNT = getOrCreateBinNT(secondLast, last);
        rest.push(newNT);
    }
    return rest;
}

// ─────────────────────────────────────────────────────────────
//  GNF TRANSFORMATION STEPS
// ─────────────────────────────────────────────────────────────

function toGNF(cnfGrammar) {
    const steps = [];

    function capture(g, name, desc, changes = []) {
        steps.push({ name, description: desc, grammar: cloneGrammar(g), changes });
    }

    let g = cloneGrammar(cnfGrammar);

    capture(g, 'Starting Point (CNF Result)',
        '<strong>Input:</strong> CNF grammar (all productions are A → BC or A → a)<br>' +
        '<strong>Goal:</strong> Convert to Greibach Normal Form (GNF): A → a α (terminal-first form)<br>' +
        '<strong>Why GNF?</strong> Useful for pushdown automata construction, top-down parsing, and certain theoretical proofs<br>' +
        '<strong>Process:</strong> We will order non-terminals and use substitution to force terminals to appear first in every production');

    /* ── Step 1: Order non-terminals ── */
    const nts = [...g.rules.keys()];
    // Put start first
    const ordered = [g.start, ...nts.filter(n => n !== g.start)];

    steps.push({
        name: 'Step 1 — Order Non-Terminals',
        description: `<strong>Indexing:</strong> Order non-terminals as A₁, A₂, … Aₙ<br>` +
            `<strong>Current ordering:</strong> ${ordered.join(', ')}<br>` +
            `<strong>Strategy:</strong> Process each Aᵢ and ensure:<br>` +
            `• No productions Aᵢ → Aⱼ γ where j ≤ i (only forward references allowed)<br>` +
            `• No left recursion Aᵢ → Aᵢ α<br>` +
            `• This systematic ordering ensures we can resolve all dependencies`,
        grammar: cloneGrammar(g),
        changes: ordered.map((nt, i) => ({ type: 'info', text: `A${i + 1} = ${nt}` }))
    });

    /* ── Step 2: Forward substitution (eliminate left recursion & lower-index references) ── */
    g = forwardSubstitution(g, ordered, steps);

    /* ── Step 3: Backward substitution to get GNF ── */
    g = backwardSubstitution(g, ordered, steps);

    /* ── Final ── */
    capture(g, 'Final GNF Grammar',
        '<strong>✓ Success!</strong> Grammar is now in Greibach Normal Form (GNF)<br>' +
        '<strong>Properties:</strong><br>' +
        '• Every production has form A → a α where a is a terminal and α is zero or more non-terminals<br>' +
        '• All productions are terminal-leading (no left recursion possible)<br>' +
        '• No unit productions; no ε-rules<br>' +
        '<strong>Applications:</strong><br>' +
        '• Converting CFGs to equivalent Pushdown Automata (PDA)<br>' +
        '• Top-down parsing without backtracking<br>' +
        '• Theoretical proofs about grammar equivalence');

    return { steps, final: g };
}

function forwardSubstitution(g, ordered, steps) {
    const g2 = cloneGrammar(g);
    const changes = [];

    for (let i = 0; i < ordered.length; i++) {
        const Ai = ordered[i];
        if (!g2.rules.has(Ai)) continue;

        // Eliminate self left-recursion and lower-index left-recursion
        for (let j = 0; j < i; j++) {
            const Aj = ordered[j];
            const newProds = [];
            for (const prod of (g2.rules.get(Ai) || [])) {
                if (prod.length > 0 && prod[0] === Aj) {
                    // Substitute Aj's productions
                    for (const ajProd of (g2.rules.get(Aj) || [])) {
                        const combined = [...ajProd, ...prod.slice(1)];
                        newProds.push(combined);
                        changes.push({ type: 'added', text: `${Ai} → ${combined.join(' ')} (sub ${Aj})` });
                    }
                    changes.push({ type: 'removed', text: `${Ai} → ${prod.join(' ')}` });
                } else {
                    newProds.push(prod);
                }
            }
            g2.rules.set(Ai, deduplicateProds(newProds));
        }

        // Now eliminate immediate left recursion: Ai -> Ai α
        const recursive = (g2.rules.get(Ai) || []).filter(p => p.length > 0 && p[0] === Ai);
        const nonRecursive = (g2.rules.get(Ai) || []).filter(p => !(p.length > 0 && p[0] === Ai));

        if (recursive.length > 0) {
            const Ai_prime = Ai + "'";
            g2.rules.set(Ai, []);
            g2.rules.set(Ai_prime, []);
            const newAiProds = [];
            const newAiPrimeProds = [];

            for (const p of nonRecursive) {
                newAiProds.push([...p, Ai_prime]);
                newAiProds.push([...p]);
                changes.push({ type: 'added', text: `${Ai} → ${[...p, Ai_prime].join(' ')}` });
            }
            for (const p of recursive) {
                const tail = p.slice(1);
                newAiPrimeProds.push([...tail, Ai_prime]);
                newAiPrimeProds.push([...tail]);
                changes.push({ type: 'added', text: `${Ai_prime} → ${[...tail, Ai_prime].join(' ')}` });
            }
            for (const p of recursive) changes.push({ type: 'removed', text: `${Ai} → ${p.join(' ')} (left recursive)` });

            g2.rules.set(Ai, deduplicateProds(newAiProds));
            g2.rules.set(Ai_prime, deduplicateProds(newAiPrimeProds));
            // Add to ordered list
            if (!ordered.includes(Ai_prime)) ordered.push(Ai_prime);
        }
    }

    steps.push({
        name: 'Step 2 — Forward Substitution & Eliminate Left Recursion',
        description: '<strong>Forward Substitution:</strong> For each Aᵢ, substitute any lower-indexed Aⱼ (j < i) that appears on the left of productions<br>' +
            '<strong>Example:</strong> If A₂ → A₁ b and A₁ → c, replace with A₂ → c b<br>' +
            '<strong>Left Recursion Elimination:</strong> If Aᵢ → Aᵢ α γ (self-loop), convert to A → β A\', A\' → α A\' | ε<br>' +
            '<strong>Result:</strong> All dependencies now point to higher-indexed variables; left recursion removed',
        grammar: cloneGrammar(g2),
        changes: changes.length ? changes : [{ type: 'info', text: 'No left recursion found' }]
    });
    return g2;
}

function backwardSubstitution(g, ordered, steps) {
    const g2 = cloneGrammar(g);
    const changes = [];

    const originalVars = ordered.filter(v => !v.includes("'"));
    const zVars = ordered.filter(v => v.includes("'"));

    // Work backwards from last original NT
    for (let i = originalVars.length - 1; i >= 0; i--) {
        const Ai = originalVars[i];
        if (!g2.rules.has(Ai)) continue;
        const newProds = [];
        for (const prod of (g2.rules.get(Ai) || [])) {
            if (prod.length === 0) { newProds.push(prod); continue; }
            if (isTerminal(prod[0])) { newProds.push(prod); continue; }
            const leading = prod[0];
            // Substitute with leading NT's productions
            for (const leadProd of (g2.rules.get(leading) || [])) {
                const combined = [...leadProd, ...prod.slice(1)];
                newProds.push(combined);
                changes.push({ type: 'added', text: `${Ai} → ${combined.join(' ')} (sub ${leading})` });
            }
            changes.push({ type: 'removed', text: `${Ai} → ${prod.join(' ')}` });
        }
        g2.rules.set(Ai, deduplicateProds(newProds));
    }

    // Substitute into Z vars (left recursion generated NTs)
    for (const Zi of zVars) {
        if (!g2.rules.has(Zi)) continue;
        const newProds = [];
        for (const prod of (g2.rules.get(Zi) || [])) {
            if (prod.length === 0) { newProds.push(prod); continue; }
            if (isTerminal(prod[0])) { newProds.push(prod); continue; }
            const leading = prod[0];
            for (const leadProd of (g2.rules.get(leading) || [])) {
                const combined = [...leadProd, ...prod.slice(1)];
                newProds.push(combined);
                changes.push({ type: 'added', text: `${Zi} → ${combined.join(' ')} (sub ${leading})` });
            }
            changes.push({ type: 'removed', text: `${Zi} → ${prod.join(' ')}` });
        }
        g2.rules.set(Zi, deduplicateProds(newProds));
    }

    steps.push({
        name: 'Step 3 — Backward Substitution',
        description: '<strong>Backward pass (i = n down to 1):</strong><br>' +
            '<strong>Goal:</strong> Ensure every production of each variable starts with a terminal<br>' +
            '<strong>Method:</strong> For each Aᵢ, if a production has form Aᵢ → Aⱼ γ (j > i), substitute Aⱼ\'s terminal-leading productions<br>' +
            '<strong>Why it works:</strong> Since we already processed higher variables (j > i), they all have terminal-leading rules. Substituting forces a terminal to the front<br>' +
            '<strong>Result:</strong> All productions now in GNF form: A → a α',
        grammar: cloneGrammar(g2),
        changes: changes.length ? changes : [{ type: 'info', text: 'No substitution needed' }]
    });
    return g2;
}

function deduplicateProds(prods) {
    const seen = new Set();
    return prods.filter(p => {
        const k = p.join('§');
        if (seen.has(k)) return false;
        seen.add(k); return true;
    });
}

// ─────────────────────────────────────────────────────────────
//  RENDERING
// ─────────────────────────────────────────────────────────────

function renderGrammar(grammar, animate = false) {
    const lines = grammarToString(grammar);
    const nts = new Set(grammar.rules.keys());

    if (lines.length === 0) return '<p class="text-slate-500 text-sm italic">Empty grammar</p>';

    let html = '<div class="grammar-block">';
    // Group by LHS
    const grouped = {};
    for (const { lhs, rhs } of lines) {
        if (!grouped[lhs]) grouped[lhs] = [];
        grouped[lhs].push(rhs);
    }
    const start = grammar.start;
    const keys = [start, ...Object.keys(grouped).filter(k => k !== start)];
    keys.forEach((lhs, i) => {
        if (!grouped[lhs]) return;
        const alternatives = grouped[lhs];
        let rhsHtml = alternatives.map(rhs => {
            return rhs.map(sym => {
                if (sym === EPSILON) return `<span class="epsilon">ε</span>`;
                if (nts.has(sym)) return `<span class="nonterminal">${escHtml(sym)}</span>`;
                return `<span class="terminal">${escHtml(sym)}</span>`;
            }).join(' ');
        }).join(' <span style="color:#475569"> | </span>');

        const delay = animate ? i * 50 : 0;
        const animClass = animate ? 'animate-line' : '';

        html += `<div class="flex flex-wrap items-baseline gap-0 ${animClass}" style="animation-delay:${delay}ms">
            <span class="prod-lhs">${escHtml(lhs)}</span>
            <span class="prod-arrow">→</span>
            <span class="prod-rhs flex flex-wrap gap-x-1">${rhsHtml}</span>
        </div>`;
    });
    html += '</div>';
    return html;
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderChangeTags(changes) {
    if (!changes || changes.length === 0) return '';
    const max = 8;
    const visible = changes.slice(0, max);
    const extra = changes.length - max;
    let html = '<div class="change-list">';
    for (const c of visible) {
        html += `<span class="change-tag ${c.type}">${escHtml(c.text)}</span>`;
    }
    if (extra > 0) html += `<span class="change-tag info">+${extra} more</span>`;
    html += '</div>';
    return html;
}

function renderSteps(steps, prefix, isFinal = false) {
    let html = '';
    steps.forEach((step, index) => {
        const isFinalStep = index === steps.length - 1;
        const colorClass = isFinalStep ? `${prefix}-final` : `${prefix}-${index % 5}`;

        // Find theorem info
        const theorem = THEOREMS[step.name] || null;

        if (isFinalStep) {
            html += `
            <div id="step-${prefix}-${index}" style="margin-top: 24px; padding: 12px;">
                <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 20px;">
                    <div style="width: 26px; height: 26px; background: #00cc00; display:flex; align-items:center; justify-content:center; border: 2px solid #009900; box-shadow: 1px 1px 2px rgba(0,0,0,0.2);">
                        <svg style="width: 18px; height: 18px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="4">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <span style="font-size: 1.3rem; color: var(--text-primary); font-family: 'Segoe UI', sans-serif;">Final ${prefix.toUpperCase()}:</span>
                </div>
                ${renderGrammar(step.grammar, false)}
            </div>`;
        } else {
            html += `
            <div id="step-${prefix}-${index}" class="step-card ${colorClass}">
                <div class="step-header">
                    <div class="step-number">${index + 1}</div>
                    <div class="flex-1" onclick="toggleStep(this.parentElement)">
                        <p class="font-semibold text-sm step-label">${escHtml(step.name)}</p>
                    </div>
                    
                    ${theorem ? `
                    <div class="tooltip-container mr-2">
                        <button class="info-trigger ${index === 1 ? 'new-step' : ''}" title="View Theorem" onclick="event.stopPropagation(); toggleTooltip(this);">
                            ?
                        </button>
                        <div class="tooltip-content">
                            <span class="tooltip-header">${escHtml(theorem.header)}</span>
                            <span class="tooltip-theory">${escHtml(theorem.theory)}</span>
                        </div>
                    </div>
                    ` : ''}

                    <svg class="chevron w-4 h-4 text-slate-500 ml-2 flex-shrink-0 cursor-pointer" onclick="toggleStep(this.parentElement)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </div>
                <div class="step-body ${index === 0 ? 'open' : ''}">
                    <div class="step-description">${step.description}</div>
                    ${renderChangeTags(step.changes)}
                    ${renderGrammar(step.grammar, true)}
                </div>
            </div>`;
        }
    });
    return html;
}

function toggleStep(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector('.chevron');
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    chevron.classList.toggle('open', !isOpen);
}

// ─────────────────────────────────────────────────────────────
//  CYK ALGORITHM
// ─────────────────────────────────────────────────────────────

/**
 * CYK Algorithm for membership testing
 * Grammar must be in CNF (A -> BC or A -> a)
 */
function cyk(grammar, string) {
    if (!string) return { accept: grammar.rules.has(grammar.start) && grammar.rules.get(grammar.start).some(p => p.length === 0), table: [] };

    const n = string.length;
    const rules = grammar.rules;
    const table = Array.from({ length: n }, () => Array.from({ length: n }, () => new Set()));

    // Step 1: Fill the first row (terminals)
    for (let i = 0; i < n; i++) {
        const char = string[i];
        for (const [nt, prods] of rules) {
            for (const p of prods) {
                if (p.length === 1 && p[0] === char) {
                    table[0][i].add(nt);
                }
            }
        }
    }

    // Step 2: Fill the rest of the table
    for (let length = 2; length <= n; length++) { // length of substring
        for (let i = 0; i <= n - length; i++) { // start position
            for (let k = 1; k < length; k++) { // split point
                // Check if any A -> BC exists where B is in table[k-1][i] and C is in table[length-k-1][i+k]
                const setB = table[k - 1][i];
                const setC = table[length - k - 1][i + k];

                if (setB.size > 0 && setC.size > 0) {
                    for (const [nt, prods] of rules) {
                        for (const p of prods) {
                            if (p.length === 2 && setB.has(p[0]) && setC.has(p[1])) {
                                table[length - 1][i].add(nt);
                            }
                        }
                    }
                }
            }
        }
    }

    const accept = table[n - 1][0].has(grammar.start);
    return { accept, table, string, grammar };
}

/**
 * Reconstruct tree using backpointers
 */
function getTree(result) {
    const { table, string, grammar } = result;
    const n = string.length;
    if (!result.accept) return null;

    function buildNode(length, start, symbol) {
        if (length === 1) {
            return {
                label: symbol,
                type: 'nt',
                children: [{ label: string[start], type: 'term', children: [] }]
            };
        }

        // Search for the split point k
        for (let k = 1; k < length; k++) {
            const setB = table[k - 1][start];
            const setC = table[length - k - 1][start + k];

            for (const [nt, prods] of grammar.rules) {
                if (nt !== symbol) continue;
                for (const p of prods) {
                    if (p.length === 2 && setB.has(p[0]) && setC.has(p[1])) {
                        const leftChild = buildNode(k, start, p[0]);
                        const rightChild = buildNode(length - k, start + k, p[1]);
                        if (leftChild && rightChild) {
                            return {
                                label: symbol,
                                type: 'nt',
                                children: [leftChild, rightChild]
                            };
                        }
                    }
                }
            }
        }
        return null;
    }

    const tree = buildNode(n, 0, grammar.start);
    return tree;
}

// counter used by renderTreeElement to assign unique IDs
let _treeNodeCounter = 0;

function renderTreeElement(node) {
    if (!node) return '';
    const isLeaf = !node.children || node.children.length === 0;
    const nodeId = `tn-${_treeNodeCounter++}`;
    let html = `<div class="tree-node ${isLeaf ? 'leaf' : ''} tree-hidden" data-tid="${nodeId}">
        <div class="tree-label ${node.type}">${escHtml(node.label)}</div>`;

    if (!isLeaf) {
        html += `<div class="tree-children">`;
        for (const child of node.children) {
            html += renderTreeElement(child);
        }
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function renderTree(result) {
    const tree = getTree(result);
    if (!tree) return '<div class="info-box">Tree generation is only available for accepted strings.</div>';

    // Reset counter so IDs are stable each render
    _treeNodeCounter = 0;
    const treeHtml = renderTreeElement(tree);

    return `
        <div class="flex flex-col items-center">

            <!-- Parse Tree Animation Control Bar -->
            <div id="treeAnimBar"
                class="w-full mb-4 p-3 rounded-xl flex flex-wrap items-center gap-3"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(12px);">

                <!-- Step controls -->
                <div class="flex items-center gap-2">
                    <button id="treeBtnReset" title="Reset"
                        class="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"
                        onclick="treeAnimReset()">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                    </button>
                    <button id="treeBtnPrev" title="Previous Step"
                        class="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-30"
                        disabled onclick="treeAnimStep(-1)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div class="text-xs font-mono text-slate-400 min-w-[80px] text-center">
                        NODE <span id="treeStepCur" class="text-white font-bold">0</span>
                        / <span id="treeStepTotal" class="font-bold">0</span>
                    </div>
                    <button id="treeBtnNext" title="Next Step"
                        class="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-30"
                        disabled onclick="treeAnimStep(1)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>

                <!-- Progress bar + label -->
                <div class="flex-1 flex flex-col gap-1 min-w-[120px]">
                    <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div id="treeAnimProgress" class="h-full rounded-full transition-all duration-400"
                            style="width:0%;background:linear-gradient(90deg,#fb923c,#f59e0b);"></div>
                    </div>
                    <p id="treeStepLabel" class="text-xs text-slate-400 truncate">Press Play or → to reveal nodes</p>
                </div>

                <!-- Speed + Play/Pause -->
                <div class="flex items-center gap-2">
                    <button id="btnDownloadTree" title="Download Tree (Text)"
                        class="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"
                        onclick="downloadParseTree()">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 8m4 4V4"></path>
                        </svg>
                    </button>
                    <select id="treeAnimSpeed"
                        class="text-xs bg-white/5 border border-white/10 text-slate-300 rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                        <option value="1500">Slow</option>
                        <option value="800" selected>Normal</option>
                        <option value="350">Fast</option>
                    </select>
                    <button id="treeBtnPlay"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style="background:linear-gradient(135deg,#fb923c,#f59e0b);color:#fff;"
                        onclick="treeAnimTogglePlay()">
                        <svg id="treePlayIcon" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                                clip-rule="evenodd"/>
                        </svg>
                        <span id="treePlayLabel">Play</span>
                    </button>
                </div>
            </div>

            <!-- Banner -->
            <div class="final-banner mb-4 gap-2 flex items-center w-full"
                style="background:rgba(251,146,60,0.1);border-color:rgba(251,146,60,0.3);color:#fb923c;">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
                Derivation Tree for "${result.string}" (CNF-based)
            </div>

            <!-- Tree Canvas -->
            <div class="tree-container custom-scroll w-full" id="treeCanvas">${treeHtml}</div>

            <div class="mt-6 p-4 bg-white/5 border border-white/5 text-xs text-slate-400 rounded-xl max-w-lg">
                <p><strong>Note:</strong> Nodes are revealed in DFS order (root → left → right). The tree is based on the CNF grammar, so it is always binary.</p>
            </div>
        </div>
    `;
}

function renderCYK(grammar, string, result) {
    const n = string.length;
    if (n === 0) return '<div class="info-box">Empty string testing depends on ε-productions in the start symbol.</div>';

    let html = `
        <div class="flex flex-col items-center">
            <div class="cyk-result-badge ${result.accept ? 'badge-success' : 'badge-fail'}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    ${result.accept
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'}
                </svg>
                String "${string}" ${result.accept ? 'is accepted' : 'is rejected'}
            </div>

            <div class="cyk-table-container custom-scroll">
                <table class="cyk-table">
                    <thead>
                        <tr>
                            ${Array.from(string).map(char => `<th class="cyk-string-header">${escHtml(char)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
    `;

    // Render table rows from bottom (length 1) to top (length n)
    for (let row = 0; row < n; row++) {
        html += '<tr>';
        for (let col = 0; col < n - row; col++) {
            const set = result.table[row][col];
            const isAcceptCell = (row === n - 1 && col === 0 && result.accept);
            html += `
                <td class="cyk-cell ${set.size > 0 ? 'active' : 'empty'} ${isAcceptCell ? 'accept' : ''}">
                    <div class="nts">${set.size > 0 ? Array.from(set).join(', ') : '∅'}</div>
                    <div class="indices">${row + 1},${col + 1}</div>
                </td>
            `;
        }
        // Fill the rest with empty space to keep triangle shape but flat table is fine too
        // For a triangular display we can just stop the row
        html += '</tr>';
    }

    html += `
                    </tbody>
                </table>
            </div>
            
            <div class="mt-8 p-5 rounded-xl bg-white/5 border border-white/5 text-sm text-slate-400 max-w-lg leading-relaxed">
                <p class="font-semibold text-white mb-2 underline decoration-teal-500/30">Understanding the table:</p>
                <p>The CYK table is built bottom-up. Each cell <span class="text-teal-400">i,j</span> represents the set of non-terminals that can derive the substring of length <span class="text-white">i</span> starting at position <span class="text-white">j</span>. If the start symbol <span class="text-teal-400">${escHtml(grammar.start)}</span> appears in the top cell, the string belongs to the language.</p>
            </div>
        </div>
    `;
    return html;
}

// ─────────────────────────────────────────────────────────────
//  UI CONTROLLER
// ─────────────────────────────────────────────────────────────

let currentCNFResult = null;

/** Holds all animation state for the grammar graph */
const graphAnim = {
    steps: [],
    currentStep: 0,
    playTimer: null,
    grammar: null,
};

/** Holds all animation state for the parse tree */
const treeAnim = {
    nodes: [],        // ordered list of DOM ids to reveal (DFS)
    currentStep: 0,
    playTimer: null,
};

function toggleTooltip(btn) {
    // Close other tooltips
    document.querySelectorAll('.info-trigger').forEach(b => {
        if (b !== btn) b.classList.remove('active');
    });
    btn.classList.toggle('active');
}

// Global click listener to close tooltip when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.tooltip-container')) {
        document.querySelectorAll('.info-trigger.active').forEach(b => b.classList.remove('active'));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setupExamples();
    setupTabs();
    setupButtons();
    initTheme();
});

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    const currentTheme = localStorage.getItem('theme') || 'dark';

    if (currentTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    }

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    });
}

function setupExamples() {
    const list = document.getElementById('examplesList');
    EXAMPLES.forEach((ex, i) => {
        const btn = document.createElement('button');
        btn.className = 'example-btn';
        btn.innerHTML = `<span class="ex-label">Example ${i + 1}</span>${ex.label}`;
        btn.addEventListener('click', () => {
            document.getElementById('grammarInput').value = ex.grammar;
            document.getElementById('parseError').classList.add('hidden');
        });
        list.appendChild(btn);
    });
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchToTab(tab);
        });
    });
}

function switchToTab(tab) {
    // Stop graph auto-play when navigating away
    if (tab !== 'graph' && graphAnim.playTimer) _graphStopPlay();

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const target = document.getElementById(tab + 'Output');
    if (target) {
        target.classList.add('active');
        if (tab === 'graph' && window.cyInstance) {
            setTimeout(() => {
                window.cyInstance.resize();
                window.cyInstance.fit();
            }, 50);
        }
    }

    // Show/hide walkthrough handled at tab level
}

function setupButtons() {
    document.getElementById('btnTransform').addEventListener('click', runTransform);
    document.getElementById('btnClear').addEventListener('click', () => {
        document.getElementById('grammarInput').value = '';
        document.getElementById('parseError').classList.add('hidden');
        document.getElementById('testSection').classList.add('opacity-50', 'pointer-events-none');
    });
    document.getElementById('btnExample').addEventListener('click', () => {
        const ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
        document.getElementById('grammarInput').value = ex.grammar;
        document.getElementById('parseError').classList.add('hidden');
    });

    document.getElementById('btnTestString').addEventListener('click', runMembershipTest);
    document.getElementById('testStringInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') runMembershipTest();
    });


}

let activeWalkthroughTab = 'cnf';
let currentWalkStep = 0;
let currentStepCNF = 0;
let currentStepGNF = 0;
let autoPlayInterval = null;
let autoPlayStateCNF = false;
let autoPlayStateGNF = false;





function navigateStep(tab, delta) {
    const container = document.getElementById(tab + 'Output');
    const steps = container.querySelectorAll('.step-card');
    let currentStep = tab === 'cnf' ? currentStepCNF : currentStepGNF;
    const nextStep = currentStep + delta;
    
    if (nextStep >= 0 && nextStep < steps.length) {
        currentStep = nextStep;
        if (tab === 'cnf') {
            currentStepCNF = currentStep;
        } else {
            currentStepGNF = currentStep;
        }
        updateStepDisplay(tab, currentStep);
    }
}

function autoPlayTransformation(tab) {
    const tabKey = tab === 'cnf' ? 'CNF' : 'GNF';
    const buttonId = `btnAutoPlay${tabKey}`;
    const button = document.getElementById(buttonId);
    const isPlaying = tab === 'cnf' ? autoPlayStateCNF : autoPlayStateGNF;
    let currentStep = tab === 'cnf' ? currentStepCNF : currentStepGNF;
    
    if (isPlaying) {
        // Stop auto play
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
        }
        if (tab === 'cnf') autoPlayStateCNF = false;
        else autoPlayStateGNF = false;
        
        button.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path>
            </svg>
            Auto Play
        `;
    } else {
        // Start auto play
        if (tab === 'cnf') autoPlayStateCNF = true;
        else autoPlayStateGNF = true;
        
        button.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path>
            </svg>
            Pause
        `;
        
        autoPlayInterval = setInterval(() => {
            const container = document.getElementById(tab + 'Output');
            const steps = container.querySelectorAll('.step-card');
            
            // Get current step for this tab
            let stepIndex = tab === 'cnf' ? currentStepCNF : currentStepGNF;
            
            if (stepIndex < steps.length - 1) {
                stepIndex++;
                if (tab === 'cnf') currentStepCNF = stepIndex;
                else currentStepGNF = stepIndex;
                updateStepDisplay(tab, stepIndex);
            } else {
                // Restart
                clearInterval(autoPlayInterval);
                autoPlayInterval = null;
                if (tab === 'cnf') autoPlayStateCNF = false;
                else autoPlayStateGNF = false;
                
                button.innerHTML = `
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path>
                    </svg>
                    Auto Play
                `;
            }
        }, 2500);
    }
}

function updateStepDisplay(tab, stepIndex) {
    const container = document.getElementById(tab + 'Output');
    const steps = container.querySelectorAll('.step-card');
    
    // Show ONLY current step
    steps.forEach((s, i) => {
        const isOpen = i === stepIndex;
        if (isOpen) {
            s.classList.remove('hidden');
            const body = s.querySelector('.step-body');
            if (body) body.classList.add('open');
            const chevron = s.querySelector('.chevron');
            if (chevron) chevron.classList.add('hidden');
            const header = s.querySelector('.step-header');
            if (header) {
                header.style.cursor = 'default';
            }
        } else {
            s.classList.add('hidden');
        }
    });
}



function runTransform() {
    const input = document.getElementById('grammarInput').value.trim();
    const errorBox = document.getElementById('parseError');

    errorBox.classList.add('hidden');

    if (!input) {
        errorBox.textContent = 'Please enter a grammar.';
        errorBox.classList.remove('hidden');
        return;
    }

    let grammar;
    try {
        grammar = parseGrammar(input);
    } catch (e) {
        errorBox.textContent = '⚠ Parse error: ' + e.message;
        errorBox.classList.remove('hidden');
        return;
    }

    // CNF
    let cnfResult;
    try {
        cnfResult = toCNF(grammar);
    } catch (e) {
        errorBox.textContent = '⚠ CNF error: ' + e.message;
        errorBox.classList.remove('hidden');
        return;
    }

    // GNF
    let gnfResult;
    try {
        gnfResult = toGNF(cnfResult.final);
    } catch (e) {
        gnfResult = null;
    }

    // Render CNF
    const cnfOut = document.getElementById('cnfOutput');
    cnfOut.innerHTML = `
        <div class="final-banner mb-4 gap-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                CNF Transformation — ${cnfResult.steps.length} steps
            </div>
            <div class="flex items-center gap-2">
                <button id="btnPrevCNF" class="btn-secondary py-1.5 px-2 text-xs flex items-center" title="Previous Step">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <button id="btnNextCNF" class="btn-secondary py-1.5 px-2 text-xs flex items-center" title="Next Step">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
                <button id="btnAutoPlayCNF" class="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                    Auto Play
                </button>
                <button id="btnDownloadCNF" class="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5" title="Download Grammar">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 8m4 4V4"></path></svg>
                </button>
            </div>
        </div>
        <div class="space-y-3">${renderSteps(cnfResult.steps, 'cnf')}</div>
    `;

    // Render GNF
    const gnfOut = document.getElementById('gnfOutput');
    if (gnfResult) {
        gnfOut.innerHTML = `
            <div class="final-banner gnf mb-4 gap-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    GNF Transformation — ${gnfResult.steps.length} steps
                </div>
                <div class="flex items-center gap-2">
                    <button id="btnPrevGNF" class="btn-secondary py-1.5 px-2 text-xs flex items-center" title="Previous Step">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                    </button>
                    <button id="btnNextGNF" class="btn-secondary py-1.5 px-2 text-xs flex items-center" title="Next Step">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                    <button id="btnAutoPlayGNF" class="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                        Auto Play
                    </button>
                    <button id="btnDownloadGNF" class="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5" title="Download Grammar">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 8m4 4V4"></path></svg>
                    </button>
                </div>
            </div>
            <div class="info-box">ℹ GNF transformation starts from the CNF result.</div>
            <div class="space-y-3">${renderSteps(gnfResult.steps, 'gnf')}</div>
        `;
    } else {
        gnfOut.innerHTML = `<div class="info-box">GNF conversion could not be completed for this grammar. Try simplifying the grammar first.</div>`;
    }

    // Show outputs
    document.getElementById('emptyState').classList.add('hidden');
    currentWalkStep = 0;
    currentStepCNF = 0;
    currentStepGNF = 0;
    autoPlayStateCNF = false;
    autoPlayStateGNF = false;
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }
    switchToTab('cnf');

    // Attach auto play listeners
    const btnAutoPlayCNF = document.getElementById('btnAutoPlayCNF');
    const btnAutoPlayGNF = document.getElementById('btnAutoPlayGNF');
    
    if (btnAutoPlayCNF) {
        btnAutoPlayCNF.addEventListener('click', () => autoPlayTransformation('cnf'));
    }
    if (btnAutoPlayGNF) {
        btnAutoPlayGNF.addEventListener('click', () => autoPlayTransformation('gnf'));
    }

    // Attach Download Listeners
    const btnDownloadCNF = document.getElementById('btnDownloadCNF');
    const btnDownloadGNF = document.getElementById('btnDownloadGNF');
    if (btnDownloadCNF) btnDownloadCNF.addEventListener('click', () => downloadGrammarData('CNF', cnfResult.final));
    if (btnDownloadGNF) btnDownloadGNF.addEventListener('click', () => downloadGrammarData('GNF', gnfResult.final));

    // Attach navigation listeners
    const btnPrevCNF = document.getElementById('btnPrevCNF');
    const btnNextCNF = document.getElementById('btnNextCNF');
    const btnPrevGNF = document.getElementById('btnPrevGNF');
    const btnNextGNF = document.getElementById('btnNextGNF');
    
    if (btnPrevCNF) {
        btnPrevCNF.addEventListener('click', () => navigateStep('cnf', -1));
    }
    if (btnNextCNF) {
        btnNextCNF.addEventListener('click', () => navigateStep('cnf', 1));
    }
    if (btnPrevGNF) {
        btnPrevGNF.addEventListener('click', () => navigateStep('gnf', -1));
    }
    if (btnNextGNF) {
        btnNextGNF.addEventListener('click', () => navigateStep('gnf', 1));
    }

    // Initialize display to show ONLY the first step
    updateStepDisplay('cnf', 0);
    if (gnfResult) updateStepDisplay('gnf', 0);

    // Save result for membership test
    currentCNFResult = cnfResult.final;
    document.getElementById('testSection').classList.remove('opacity-50', 'pointer-events-none');

    // Render Graph
    renderGrammarGraph(grammar);
}

// ─────────────────────────────────────────────────────────────
//  GRAMMAR GRAPH — STEP-WISE ANIMATION
// ─────────────────────────────────────────────────────────────

function renderGrammarGraph(grammar) {
    graphAnim.grammar = grammar;

    // ── 1. Build ordered node/edge lists for step-by-step reveal ──
    const nts = new Set(grammar.rules.keys());
    const allNodes = new Map();   // id -> data
    const allEdges = [];          // [{id, source, target}]
    const edgeSeen = new Set();

    // NT nodes (start symbol first)
    const ntOrder = [grammar.start, ...[...nts].filter(n => n !== grammar.start)];
    for (const nt of ntOrder) {
        allNodes.set(nt, { id: nt, label: nt, type: 'nt' });
    }

    // Collect all edges + terminal nodes (in production order)
    for (const lhs of ntOrder) {
        const prods = grammar.rules.get(lhs) || [];
        for (const prod of prods) {
            for (const sym of prod) {
                if (sym === EPSILON) continue;
                let targetId;
                if (isNonTerminal(sym)) {
                    targetId = sym;
                } else {
                    targetId = `t_${sym}`;
                    if (!allNodes.has(targetId)) {
                        allNodes.set(targetId, { id: targetId, label: sym, type: 'term' });
                    }
                }
                const edgeId = `${lhs}→${targetId}`;
                if (!edgeSeen.has(edgeId)) {
                    allEdges.push({ id: edgeId, source: lhs, target: targetId });
                    edgeSeen.add(edgeId);
                }
            }
        }
    }

    // ── 2. Build Cytoscape with all elements hidden initially ──
    const elements = [];
    for (const data of allNodes.values()) {
        elements.push({ data: { ...data }, classes: 'hidden-elem' });
    }
    for (const e of allEdges) {
        elements.push({ data: { ...e }, classes: 'hidden-elem' });
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    if (window.cyInstance) {
        try { window.cyInstance.destroy(); } catch (e) { }
    }

    window.cyInstance = cytoscape({
        container: document.getElementById('cy'),
        elements,
        style: [
            {
                selector: '.hidden-elem',
                style: { 'opacity': 0 }
            },
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'color': '#fff',
                    'font-size': '14px',
                    'font-weight': 'bold',
                    'width': '50px',
                    'height': '50px',
                    'text-outline-width': 2,
                    'text-outline-color': '#111827',
                    'background-color': '#10b981',
                    'border-width': 2,
                    'border-color': '#34d399',
                    'overlay-opacity': 0,
                    'transition-property': 'opacity, background-color',
                    'transition-duration': '0.4s'
                }
            },
            {
                selector: 'node[type="term"]',
                style: {
                    'background-color': '#f59e0b',
                    'border-color': '#fbbf24',
                    'shape': 'round-rectangle',
                    'width': '40px',
                    'height': '40px',
                }
            },
            {
                selector: `node[id="${grammar.start}"]`,
                style: {
                    'border-width': 4,
                    'border-color': '#ec4899',
                    'width': '60px',
                    'height': '60px',
                }
            },
            {
                selector: '.graph-highlight',
                style: {
                    'background-color': '#818cf8',
                    'border-color': '#a5b4fc',
                    'line-color': '#a855f7',
                    'target-arrow-color': '#a855f7',
                    'border-width': 4,
                    'width': 4,
                    'z-index': 999,
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.25)',
                    'target-arrow-color': isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.25)',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1.4,
                    'transition-property': 'opacity, line-color',
                    'transition-duration': '0.4s'
                }
            }
        ],
        layout: {
            name: 'cose',
            padding: 50,
            animate: false,   // layout silently, reveal via steps
            randomize: false,
            nodeRepulsion: 500000,
            idealEdgeLength: 110,
            gravity: 80,
        }
    });

    if (isLight) {
        window.cyInstance.style()
            .selector('node')
            .style({ 'text-outline-color': '#fff', 'color': '#111827' })
            .update();
    }

    // ── 3. Build step sequence: nodes first (start, then NT, then term), then edges ──
    graphAnim.steps = [];

    // Start node
    graphAnim.steps.push({
        type: 'node', id: grammar.start,
        label: `Start symbol: ${grammar.start}`,
        color: '#ec4899'
    });

    // Other NT nodes
    for (const nt of ntOrder) {
        if (nt === grammar.start) continue;
        graphAnim.steps.push({
            type: 'node', id: nt,
            label: `Non-terminal: ${nt}`,
            color: '#10b981'
        });
    }

    // Terminal nodes
    for (const [id, data] of allNodes) {
        if (data.type === 'term') {
            graphAnim.steps.push({
                type: 'node', id,
                label: `Terminal: "${data.label}"`,
                color: '#f59e0b'
            });
        }
    }

    // Edges
    for (const e of allEdges) {
        const srcLabel = allNodes.get(e.source)?.label ?? e.source;
        const tgtLabel = allNodes.get(e.target)?.label ?? e.target;
        graphAnim.steps.push({
            type: 'edge', id: e.id,
            label: `Edge: ${srcLabel} → ${tgtLabel}`,
            color: '#a855f7'
        });
    }

    graphAnim.currentStep = 0;
    _graphStopPlay();
    _graphUpdateUI();

    // Show anim bar
    document.getElementById('graphAnimBar').classList.remove('hidden');
}

/** Reveal (or hide back) one step at a time */
function graphAnimStep(delta) {
    const next = graphAnim.currentStep + delta;
    if (next < 0 || next > graphAnim.steps.length) return;

    if (delta > 0) {
        // Reveal the element for step currentStep
        const step = graphAnim.steps[graphAnim.currentStep];
        if (step) _graphRevealStep(step);
        graphAnim.currentStep = next;
    } else {
        // Going back: reset all and replay up to next
        graphAnim.currentStep = next;
        _graphRebuildToStep(next);
    }

    _graphUpdateUI();
}

/** Reset graph to empty state */
function graphAnimReset() {
    _graphStopPlay();
    graphAnim.currentStep = 0;
    // Hide all elements
    if (window.cyInstance) {
        window.cyInstance.elements().removeClass('graph-highlight').addClass('hidden-elem');
        window.cyInstance.elements().style('opacity', 0);
    }
    _graphUpdateUI();
}

/** Toggle play / pause */
function graphAnimTogglePlay() {
    if (graphAnim.playTimer) {
        _graphStopPlay();
        return;
    }

    // If already at end, reset first
    if (graphAnim.currentStep >= graphAnim.steps.length) {
        graphAnimReset();
    }

    _graphSetPlayUI(true);

    const tick = () => {
        if (graphAnim.currentStep >= graphAnim.steps.length) {
            _graphStopPlay();
            return;
        }
        graphAnimStep(1);
    };

    const speed = parseInt(document.getElementById('graphAnimSpeed').value, 10) || 1200;
    tick(); // immediate first step
    graphAnim.playTimer = setInterval(tick, speed);
}

// ── Internal helpers ──

function _graphRevealStep(step) {
    if (!window.cyInstance) return;
    const el = window.cyInstance.getElementById(step.id);
    if (!el || el.length === 0) return;

    el.removeClass('hidden-elem').removeClass('graph-highlight');
    el.animate({ style: { opacity: 1 } }, { duration: 380 });

    // Flash highlight then fade back to normal
    el.addClass('graph-highlight');
    setTimeout(() => {
        if (el && !el.removed()) el.removeClass('graph-highlight');
    }, 700);
}

function _graphRebuildToStep(upTo) {
    if (!window.cyInstance) return;
    // Hide everything
    window.cyInstance.elements().removeClass('graph-highlight').addClass('hidden-elem');
    window.cyInstance.elements().style('opacity', 0);
    // Reveal steps 0..upTo-1 instantly
    for (let i = 0; i < upTo; i++) {
        const step = graphAnim.steps[i];
        if (!step) continue;
        const el = window.cyInstance.getElementById(step.id);
        if (el && el.length > 0) {
            el.removeClass('hidden-elem');
            el.style('opacity', 1);
        }
    }
}

function _graphUpdateUI() {
    const total = graphAnim.steps.length;
    const cur = graphAnim.currentStep;

    document.getElementById('graphStepCur').textContent = cur;
    document.getElementById('graphStepTotal').textContent = total;
    document.getElementById('graphAnimProgress').style.width = total > 0 ? `${(cur / total) * 100}%` : '0%';

    const step = graphAnim.steps[cur - 1];
    const label = step ? step.label : (cur === 0 ? 'Press Play or → to begin' : '✓ All elements revealed');
    document.getElementById('graphStepLabel').textContent = label;

    document.getElementById('graphBtnPrev').disabled = (cur <= 0);
    document.getElementById('graphBtnNext').disabled = (cur >= total);
}

function _graphStopPlay() {
    if (graphAnim.playTimer) {
        clearInterval(graphAnim.playTimer);
        graphAnim.playTimer = null;
    }
    _graphSetPlayUI(false);
}

function _graphSetPlayUI(playing) {
    const icon = document.getElementById('graphPlayIcon');
    const label = document.getElementById('graphPlayLabel');
    if (!icon || !label) return;
    if (playing) {
        icon.innerHTML = `<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path>`;
        label.textContent = 'Pause';
    } else {
        icon.innerHTML = `<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path>`;
        label.textContent = 'Play';
    }
}

function runMembershipTest() {
    if (!currentCNFResult) return;
    const stringInput = document.getElementById('testStringInput');
    const string = stringInput.value.trim();
    const output = document.getElementById('cykOutput');

    // Switch to CYK tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabEl = document.getElementById('tabCYK');
    if (tabEl) tabEl.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    output.classList.add('active');

    const result = cyk(currentCNFResult, string);
    output.innerHTML = renderCYK(currentCNFResult, string, result);

    const treeOutput = document.getElementById('treeOutput');
    treeOutput.innerHTML = renderTree(result);

    // Initialize parse tree animation after render
    initTreeAnimation();
}

// ─────────────────────────────────────────────────────────────
//  PARSE TREE — STEP-WISE ANIMATION
// ─────────────────────────────────────────────────────────────

/** Collect all tree-node elements in DFS order from the rendered DOM */
function initTreeAnimation() {
    _treeStopPlay();
    treeAnim.currentStep = 0;
    treeAnim.nodes = [];

    const canvas = document.getElementById('treeCanvas');
    if (!canvas) return;

    // DFS traversal of rendered .tree-node elements
    function dfs(el) {
        if (!el) return;
        if (el.classList && el.classList.contains('tree-node')) {
            treeAnim.nodes.push(el);
        }
        for (const child of el.children) dfs(child);
    }
    dfs(canvas);

    _treeUpdateUI();
}

/** Move the tree animation one step forward or backward */
function treeAnimStep(delta) {
    const next = treeAnim.currentStep + delta;
    if (next < 0 || next > treeAnim.nodes.length) return;

    if (delta > 0) {
        // Reveal current step node
        const el = treeAnim.nodes[treeAnim.currentStep];
        if (el) _treeRevealNode(el);
        treeAnim.currentStep = next;
    } else {
        treeAnim.currentStep = next;
        _treeRebuildToStep(next);
    }
    _treeUpdateUI();
}

/** Hide all nodes, return to step 0 */
function treeAnimReset() {
    _treeStopPlay();
    treeAnim.currentStep = 0;
    treeAnim.nodes.forEach(el => {
        el.classList.add('tree-hidden');
        el.classList.remove('tree-highlight');
    });
    _treeUpdateUI();
}

/** Toggle play / pause */
function treeAnimTogglePlay() {
    if (treeAnim.playTimer) { _treeStopPlay(); return; }
    if (treeAnim.currentStep >= treeAnim.nodes.length) treeAnimReset();
    _treeSetPlayUI(true);
    const tick = () => {
        if (treeAnim.currentStep >= treeAnim.nodes.length) { _treeStopPlay(); return; }
        treeAnimStep(1);
    };
    const speed = parseInt(document.getElementById('treeAnimSpeed')?.value || '800', 10);
    tick();
    treeAnim.playTimer = setInterval(tick, speed);
}

// ── Tree animation internal helpers ──

function _treeRevealNode(el) {
    el.classList.remove('tree-hidden');
    el.classList.add('tree-highlight');
    setTimeout(() => el && el.classList.remove('tree-highlight'), 650);
}

function _treeRebuildToStep(upTo) {
    treeAnim.nodes.forEach((el, i) => {
        el.classList.remove('tree-highlight');
        if (i < upTo) el.classList.remove('tree-hidden');
        else el.classList.add('tree-hidden');
    });
}

function _treeUpdateUI() {
    const total = treeAnim.nodes.length;
    const cur = treeAnim.currentStep;
    const curEl = document.getElementById('treeStepCur');
    const totEl = document.getElementById('treeStepTotal');
    const prog = document.getElementById('treeAnimProgress');
    const lbl = document.getElementById('treeStepLabel');
    const prev = document.getElementById('treeBtnPrev');
    const next = document.getElementById('treeBtnNext');
    if (!curEl) return;
    curEl.textContent = cur;
    totEl.textContent = total;
    prog.style.width = total > 0 ? `${(cur / total) * 100}%` : '0%';

    // Label: describe what node was just revealed
    const lastNode = treeAnim.nodes[cur - 1];
    let labelText = cur === 0
        ? 'Press Play or → to reveal nodes'
        : cur >= total
            ? '✓ Complete tree revealed'
            : `Revealed node ${cur}`;
    if (lastNode) {
        const lbl2 = lastNode.querySelector('.tree-label');
        if (lbl2) labelText = `Revealed: ${lbl2.textContent.trim()} (node ${cur})`;
    }
    lbl.textContent = labelText;
    prev.disabled = cur <= 0;
    next.disabled = cur >= total;
}

function _treeStopPlay() {
    if (treeAnim.playTimer) { clearInterval(treeAnim.playTimer); treeAnim.playTimer = null; }
    _treeSetPlayUI(false);
}

function _treeSetPlayUI(playing) {
    const icon = document.getElementById('treePlayIcon');
    const label = document.getElementById('treePlayLabel');
    if (!icon || !label) return;
    if (playing) {
        icon.innerHTML = `<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>`;
        label.textContent = 'Pause';
    } else {
        icon.innerHTML = `<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>`;
        label.textContent = 'Play';
    }
}
// ─────────────────────────────────────────────────────────────
//  DOWNLOAD HELPERS
// ─────────────────────────────────────────────────────────────

function downloadTextFile(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function downloadGrammarData(type, grammar) {
    if (!grammar) return;
    const lines = grammarToString(grammar);
    let text = `// ${type} Grammar\n// Generated by CFG Normalizer\n\n`;
    
    const grouped = {};
    for (const { lhs, rhs } of lines) {
        if (!grouped[lhs]) grouped[lhs] = [];
        grouped[lhs].push(rhs.join(' '));
    }
    
    const start = grammar.start;
    const keys = [start, ...Object.keys(grouped).filter(k => k !== start)];
    
    keys.forEach(lhs => {
        text += `${lhs} -> ${grouped[lhs].join(' | ')}\n`;
    });
    
    downloadTextFile(`grammar_${type.toLowerCase()}.txt`, text);
}

function downloadGraphImage() {
    if (!window.cyInstance) return;
    const png64 = window.cyInstance.png({ full: true, bg: '#0f172a', scale: 2 });
    const link = document.createElement('a');
    link.href = png64;
    link.download = 'grammar_graph.png';
    link.click();
}

/** Downloads the parse tree as a formatted hierarchical text file */
function downloadParseTree() {
    const canvas = document.getElementById('treeCanvas');
    if (!canvas) return;

    // We can't easily capture the HTML as image without a library,
    // so we'll generate a pretty-printed text tree.
    
    const resultBadge = document.querySelector('.cyk-result-badge');
    const testString = resultBadge ? resultBadge.textContent.match(/"([^"]+)"/)?.[1] || "string" : "string";

    function getTreeString(node, prefix = "", isLast = true) {
        if (!node) return "";
        const label = node.querySelector('.tree-label').textContent.trim();
        let result = prefix + (isLast ? "└── " : "├── ") + label + "\n";
        
        const childrenContainer = node.querySelector('.tree-children');
        if (childrenContainer) {
            const children = Array.from(childrenContainer.children);
            for (let i = 0; i < children.length; i++) {
                result += getTreeString(children[i], prefix + (isLast ? "    " : "│   "), i === children.length - 1);
            }
        }
        return result;
    }

    const root = canvas.querySelector('.tree-node');
    if (!root) {
        alert("No tree to download.");
        return;
    }

    let text = `Parse Tree for string: "${testString}"\n`;
    text += `====================================\n\n`;
    text += getTreeString(root);
    
    downloadTextFile(`parse_tree_${testString}.txt`, text);
}
