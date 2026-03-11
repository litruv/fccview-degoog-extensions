let mathEnabled = true;

const MATH_PATTERN = /^[\d\s+\-*/.^()sqrt]+$/i;
const HAS_DIGIT = /\d/;

function isMathQuery(query) {
  const q = query.trim();
  if (q.length < 1 || q.length > 80) return false;
  if (!HAS_DIGIT.test(q)) return false;
  return MATH_PATTERN.test(q);
}

const TOKEN_NUMBER = "number";
const TOKEN_PLUS = "+";
const TOKEN_MINUS = "-";
const TOKEN_STAR = "*";
const TOKEN_SLASH = "/";
const TOKEN_CARET = "^";
const TOKEN_LPAREN = "(";
const TOKEN_RPAREN = ")";
const TOKEN_SQRT = "sqrt";

function tokenize(str) {
  const tokens = [];
  let i = 0;
  const s = str.trim();

  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    if (s[i] === "+") {
      tokens.push({ type: TOKEN_PLUS });
      i++;
      continue;
    }
    if (s[i] === "-") {
      tokens.push({ type: TOKEN_MINUS });
      i++;
      continue;
    }
    if (s[i] === "*") {
      tokens.push({ type: TOKEN_STAR });
      i++;
      continue;
    }
    if (s[i] === "/") {
      tokens.push({ type: TOKEN_SLASH });
      i++;
      continue;
    }
    if (s[i] === "^") {
      tokens.push({ type: TOKEN_CARET });
      i++;
      continue;
    }
    if (s[i] === "(") {
      tokens.push({ type: TOKEN_LPAREN });
      i++;
      continue;
    }
    if (s[i] === ")") {
      tokens.push({ type: TOKEN_RPAREN });
      i++;
      continue;
    }
    if (s.substr(i, 4) === "sqrt" && (i + 4 >= s.length || /[\s(]/.test(s[i + 4]))) {
      tokens.push({ type: TOKEN_SQRT });
      i += 4;
      continue;
    }
    if (/[\d.]/.test(s[i])) {
      let num = "";
      while (i < s.length && /[\d.]/.test(s[i])) {
        num += s[i];
        i++;
      }
      const n = parseFloat(num);
      if (!Number.isFinite(n)) return null;
      tokens.push({ type: TOKEN_NUMBER, value: n });
      continue;
    }
    return null;
  }
  return tokens;
}

function parseExpr(tokens, pos) {
  let [val, next] = parseTerm(tokens, pos);
  if (val === null) return [null, pos];
  pos = next;
  while (pos < tokens.length) {
    const t = tokens[pos];
    if (t.type === TOKEN_PLUS) {
      const [rhs, nextPos] = parseTerm(tokens, pos + 1);
      if (rhs === null) return [null, pos];
      val = val + rhs;
      pos = nextPos;
    } else if (t.type === TOKEN_MINUS) {
      const [rhs, nextPos] = parseTerm(tokens, pos + 1);
      if (rhs === null) return [null, pos];
      val = val - rhs;
      pos = nextPos;
    } else break;
  }
  return [val, pos];
}

function parseTerm(tokens, pos) {
  let [val, next] = parseFactor(tokens, pos);
  if (val === null) return [null, pos];
  pos = next;
  while (pos < tokens.length) {
    const t = tokens[pos];
    if (t.type === TOKEN_STAR) {
      const [rhs, nextPos] = parseFactor(tokens, pos + 1);
      if (rhs === null) return [null, pos];
      val = val * rhs;
      pos = nextPos;
    } else if (t.type === TOKEN_SLASH) {
      const [rhs, nextPos] = parseFactor(tokens, pos + 1);
      if (rhs === null) return [null, pos];
      if (rhs === 0) return [null, pos];
      val = val / rhs;
      pos = nextPos;
    } else break;
  }
  return [val, pos];
}

function parseFactor(tokens, pos) {
  const [base, next] = parseBase(tokens, pos);
  if (base === null) return [null, pos];
  pos = next;
  if (pos < tokens.length && tokens[pos].type === TOKEN_CARET) {
    const [exp, nextPos] = parseFactor(tokens, pos + 1);
    if (exp === null) return [null, pos];
    const result = Math.pow(base, exp);
    if (!Number.isFinite(result)) return [null, pos];
    return [result, nextPos];
  }
  return [base, pos];
}

function parseBase(tokens, pos) {
  if (pos >= tokens.length) return [null, pos];
  if (tokens[pos].type === TOKEN_MINUS) {
    const [inner, next] = parseBase(tokens, pos + 1);
    if (inner === null) return [null, pos];
    return [-inner, next];
  }
  if (tokens[pos].type === TOKEN_SQRT) {
    pos++;
    if (pos >= tokens.length || tokens[pos].type !== TOKEN_LPAREN) return [null, pos];
    const [inner, next] = parseExpr(tokens, pos + 1);
    if (inner === null || inner < 0) return [null, pos];
    if (next >= tokens.length || tokens[next].type !== TOKEN_RPAREN) return [null, pos];
    return [Math.sqrt(inner), next + 1];
  }
  if (tokens[pos].type === TOKEN_LPAREN) {
    const [inner, next] = parseExpr(tokens, pos + 1);
    if (inner === null) return [null, pos];
    if (next >= tokens.length || tokens[next].type !== TOKEN_RPAREN) return [null, pos];
    return [inner, next + 1];
  }
  if (tokens[pos].type === TOKEN_NUMBER) {
    return [tokens[pos].value, pos + 1];
  }
  return [null, pos];
}

function evaluate(query) {
  const tokens = tokenize(query);
  if (!tokens || tokens.length === 0) return null;
  const [result, pos] = parseExpr(tokens, 0);
  if (result === null || pos !== tokens.length) return null;
  if (!Number.isFinite(result)) return null;
  return result;
}

function formatResult(num) {
  if (Number.isInteger(num)) return String(num);
  const s = String(num);
  if (s.length <= 12) return s;
  const rounded = Math.round(num * 1e10) / 1e10;
  return String(rounded);
}

function esc(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const slot = {
  id: "math-slot",
  name: "Math",
  description: "Evaluates math expressions and shows the result above search results.",
  position: "at-a-glance",

  settingsSchema: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
      description: "Show math result above results for expressions like 2+2 or sqrt(16).",
    },
  ],

  configure(settings) {
    mathEnabled = settings?.enabled !== "false";
  },

  trigger(query) {
    return mathEnabled && isMathQuery(query);
  },

  async execute(query) {
    const result = evaluate(query.trim());
    if (result === null) return { html: "" };
    const formatted = formatResult(result);
    const displayExpr = esc(query.trim());
    return {
      html:
        '<div class="glance-math">' +
        '<div class="glance-math-expr">' +
        displayExpr +
        "</div>" +
        '<div class="glance-math-result">' +
        esc(formatted) +
        "</div>" +
        '<span class="glance-math-badge">Math</span>' +
        "</div>",
    };
  },
};

export default { slot };
