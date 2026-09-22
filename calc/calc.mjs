// The calculator, the same one the Android and Windows apps show: the same keys in the same order, the same
// maths behind them, the result worked out as it is typed and shown dimmed below, and ⏎ to try what was typed
// as a vault password.
//
// The apps draw the expression as TeX (a real fraction, a root sign over its contents); a browser field holds
// plain text, so the same expression is written the way it is typed: 3/4, √(2), 2^10, root(3,27), log(2,8).
// What each key does, and what every expression works out to, is the app's own.

/// The keyboard, row by row, exactly as the app's calculator keyboard is laid out.
/// insert: what the key puts into the expression. hi: the app's highlighted (grey) keys.
export const KEY_ROWS = [
  [
    { label: '<span class="frac"><span>&#9633;</span><span>&#9633;</span></span>', insert: '/' , tex: true},
    { label: '&#9633;<sup>2</sup>', insert: '^2' , tex: true},
    { label: '&#9633;<sup>&#9633;</sup>', insert: '^' , tex: true},
    { label: '&radic;<span class="rad">&#9633;</span>', insert: '√(', tex: true },
    { label: '<sup class="idx">&#9633;</sup>&radic;<span class="rad">&#9633;</span>', insert: 'root(', tex: true },
  ],
  [
    { label: '&ang; &deg;', insert: '°' , tex: true},
    { label: 'sin', insert: 'sin(' , tex: true},
    { label: 'cos', insert: 'cos(' , tex: true},
    { label: 'tan', insert: 'tan(' , tex: true},
    { label: '&deg;F', insert: '°F' , tex: true},
    { label: '&deg;C', insert: '°C' , tex: true},
  ],
  [
    { label: 'sin<sup>-1</sup>', insert: 'asin(' , tex: true},
    { label: 'cos<sup>-1</sup>', insert: 'acos(' , tex: true},
    { label: 'tan<sup>-1</sup>', insert: 'atan(' , tex: true},
    { label: 'log<sub>&#9633;</sub>(&#9633;)', insert: 'log(' , tex: true},
  ],
  [
    { label: '(', insert: '(', hi: true },
    { label: ')', insert: ')', hi: true },
    { label: '&#8592;', action: 'left' },  //the app's arrow_back
    { label: '&#8594;', action: 'right' }, //and arrow_forward
    { label: '&#9003;', action: 'delete' },
    { label: 'abc', action: 'layout', layout: true },
  ],
  [
    { label: '7', insert: '7' }, { label: '8', insert: '8' }, { label: '9', insert: '9' },
    { label: '+', insert: '+', hi: true },
  ],
  [
    { label: '4', insert: '4' }, { label: '5', insert: '5' }, { label: '6', insert: '6' },
    { label: '&minus;', insert: '-', hi: true },
  ],
  [
    { label: '1', insert: '1' }, { label: '2', insert: '2' }, { label: '3', insert: '3' },
    { label: '&times;', insert: '×', hi: true },
  ],
  [
    { label: '.', insert: '.' }, { label: '0', insert: '0' }, { label: '%', insert: '%' },
    { label: '&divide;', insert: '/', hi: true },
  ],
  [
    { label: '&pi;', insert: 'π' }, { label: 'e', insert: 'e' }, { label: 'n!', insert: '!' },
    { label: '&#9166;', action: 'submit', submit: true }, //the app gives it the same width as every other key
  ],
];

/// The other page of the same keyboard: letters, for typing a password rather than a sum.
///
/// The app has this too, reached the same way -- the key at the end of the row above 7 8 9. Its lower
/// half is the calculator's own rows, so the digits and the operators stay where the hand expects them.
export const LETTER_ROWS = [
  [
    { label: '~', insert: '~' }, { label: '!', insert: '!' }, { label: '@', insert: '@' },
    { label: '#', insert: '#' }, { label: '$', insert: '$' }, { label: '%', insert: '%' },
    { label: '^', insert: '^' }, { label: '&amp;', insert: '&' }, { label: '*', insert: '*' },
    { label: '?', insert: '?' },
  ],
  [...'qwertyuiop'].map((letter) => ({ label: letter, insert: letter, letter: true })),
  [
    ...[...'asdfghjkl'].map((letter) => ({ label: letter, insert: letter, letter: true })),
    { label: '&#39;', insert: "'" },
  ],
  [
    { label: '&#8679;', action: 'shift', shift: true }, //where a keyboard keeps it: to the left of z
    ...[...'zxcvbnm'].map((letter) => ({ label: letter, insert: letter, letter: true })),
    { label: ',', insert: ',' },
    { label: '_', insert: '_' },
  ],
  [
    { label: '(', insert: '(', hi: true },
    { label: ')', insert: ')', hi: true },
    { label: '&#8592;', action: 'left' },
    { label: '&#8594;', action: 'right' },
    { label: '&#9003;', action: 'delete' },
    { label: 'f(x)', action: 'layout', layout: true },
  ],
  //and everything the calculator keeps below that row, except that here the fraction key is a slash
  ...KEY_ROWS.slice(4).map((row) => row.map((key) => (key.insert === '/' ? { ...key, label: '/' } : key))),
];

// --------------------------------------------------------------------------------------------- the maths

const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, '√': Math.sqrt,
};

function tokenize(text) {
  const tokens = [];
  let at = 0;
  while (at < text.length) {
    const c = text[at];
    if (c === ' ') {
      at++;
    } else if (/[0-9.]/.test(c)) {
      const number = /^[0-9]*\.?[0-9]*/.exec(text.substring(at))[0];
      tokens.push({ type: 'number', value: Number(number) });
      at += number.length;
    } else if (/[a-z]/i.test(c)) {
      const name = /^[a-z]+/i.exec(text.substring(at))[0].toLowerCase();
      tokens.push({ type: 'name', value: name });
      at += name.length;
    } else if (c === '°') {
      //°C and °F are one key each, and turn the whole number into the other scale
      const next = text[at + 1];
      tokens.push({ type: 'op', value: next === 'C' || next === 'F' ? `°${next}` : '°' });
      at += next === 'C' || next === 'F' ? 2 : 1;
    } else {
      tokens.push({ type: 'op', value: c });
      at++;
    }
  }
  return tokens;
}

function factorial(x) {
  if (x < 0 || x !== Math.round(x) || x > 170) throw new Error('factorial');
  let out = 1;
  for (let i = 2; i <= x; i++) out *= i;
  return out;
}

/// Works the expression out, the way the app's parser does: ° is degrees in radians, % is a hundredth,
/// n! is a factorial, °C and °F swap scales, log(b, x) is to base b and root(n, x) is the nth root.
export function evaluate(text) {
  const tokens = tokenize(text.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-'));
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (v) => peek()?.type === 'op' && peek().value === v;

  const expression = () => {
    let value = term();
    while (isOp('+') || isOp('-')) value = tokens[at++].value === '+' ? value + term() : value - term();
    return value;
  };
  const term = () => {
    let value = unary();
    while (isOp('*') || isOp('/')) value = tokens[at++].value === '*' ? value * unary() : value / unary();
    return value;
  };
  const unary = () => (isOp('-') ? (at++, -unary()) : power());
  const power = () => {
    const base = postfix();
    return isOp('^') ? (at++, Math.pow(base, unary())) : base; //right to left, as x^y^z is read
  };
  const postfix = () => {
    let value = primary();
    for (;;) {
      if (isOp('!')) { at++; value = factorial(value); } else if (isOp('%')) { at++; value /= 100; } else if (isOp('°')) {
        at++;
        value = (value * Math.PI) / 180;
      } else if (isOp('°C')) { at++; value = (value * 9) / 5 + 32; } else if (isOp('°F')) {
        at++;
        value = ((value - 32) * 5) / 9;
      } else {
        return value;
      }
    }
  };
  const closing = () => {
    if (isOp(')')) at++; //a bracket left open at the end is closed for the person, as the app's field does
    else if (at < tokens.length) throw new Error(')');
  };
  const primary = () => {
    const token = peek();
    if (!token) throw new Error('end');
    if (token.type === 'number') {
      at++;
      return token.value;
    }
    if (token.type === 'op' && token.value === '(') {
      at++;
      const value = expression();
      closing();
      return value;
    }
    if (token.value === 'π') {
      at++;
      return Math.PI;
    }
    if (token.type === 'name' || token.value === '√') {
      const name = token.value;
      at++;
      if (name === 'e') return Math.E;
      if (name === 'pi') return Math.PI;
      const wants2 = name === 'log' || name === 'root';
      if (!isOp('(')) throw new Error(name);
      at++;
      const first = expression();
      if (!wants2) {
        closing();
        const f = FUNCTIONS[name];
        if (!f) throw new Error(name);
        return f(first);
      }
      if (!isOp(',')) throw new Error(',');
      at++;
      const second = expression();
      closing();
      return name === 'log' ? Math.log(second) / Math.log(first) : Math.pow(second, 1 / first);
    }
    throw new Error(token.value);
  };

  const value = expression();
  if (at < tokens.length) throw new Error('trailing');
  return value;
}

/// The result as the app writes it: 14 decimals (2 for a temperature), no trailing zeros, and the other
/// scale's name added to a temperature.
export function resultOf(text, words) {
  if (!text) return '';
  let out;
  try {
    const value = evaluate(text);
    const temperature = text.endsWith('°C') || text.endsWith('°F');
    if (!isFinite(value)) return words.infinity;
    out = value.toFixed(temperature ? 2 : 14);
    if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '');
    if (text.endsWith('°C')) out += '°F';
    else if (text.endsWith('°F')) out += '°C';
  } catch {
    return words.invalid;
  }
  return out;
}
