import { RulesParseError } from './errors.js'

/**
 * Strict JSON parser for script-tag rules bodies.
 */
export function parseStrict(body) {
  try {
    return JSON.parse(body)
  } catch (e) {
    throw new RulesParseError(
      'hyper-html-api script tags require strict JSON. ' +
        'Relaxed JSON (unquoted keys, single quotes, trailing commas) is only supported in the ?data= URL parameter. ' +
        `Original error: ${e.message}`,
      e,
    )
  }
}

/**
 * Relaxed JSON parser for the ?data= URL parameter. Ported verbatim from
 * the legacy hyperclay/server-lib/data-extractor.js parseExtractionRules()
 * so existing URLs continue to parse identically.
 */
export function parseRelaxed(queryString) {
  try {
    return JSON.parse(queryString)
  } catch (_) {
    /* fall through to tokenizer */
  }

  const TokenType = {
    BRACE_OPEN: '{',
    BRACE_CLOSE: '}',
    BRACKET_OPEN: '[',
    BRACKET_CLOSE: ']',
    COLON: ':',
    COMMA: ',',
    STRING: 'STRING',
    SELECTOR: 'SELECTOR',
    IDENTIFIER: 'IDENTIFIER',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
  }

  function tokenize(input) {
    const tokens = []
    let i = 0

    while (i < input.length) {
      const char = input[i]

      if (/\s/.test(char)) {
        i++
        continue
      }

      if ('{}'.includes(char)) {
        tokens.push({ type: char, value: char })
        i++
        continue
      }

      if (char === '[') {
        let isAttributeSelector = false
        let j = i + 1

        while (j < input.length && /\s/.test(input[j])) j++

        if (j < input.length && /[a-zA-Z_]/.test(input[j])) {
          isAttributeSelector = true
        }

        if (!isAttributeSelector) {
          tokens.push({ type: char, value: char })
          i++
          continue
        }
      }

      if (char === ']') {
        tokens.push({ type: char, value: char })
        i++
        continue
      }

      if (char === ':') {
        tokens.push({ type: TokenType.COLON, value: char })
        i++
        continue
      }

      if (char === ',') {
        tokens.push({ type: TokenType.COMMA, value: char })
        i++
        continue
      }

      if (char === '"' || char === "'") {
        const quote = char
        let j = i + 1
        while (j < input.length && input[j] !== quote) {
          if (input[j] === '\\') j++
          j++
        }
        tokens.push({
          type: TokenType.STRING,
          value: input.substring(i + 1, j),
          quoted: true,
        })
        i = j + 1
        continue
      }

      let j = i
      let value

      while (j < input.length && !/[{},]/.test(input[j])) {
        if (input[j] === ':') {
          const pseudoSelectors = [
            ':first',
            ':last',
            ':nth-child',
            ':nth-of-type',
            ':first-child',
            ':last-child',
            ':first-of-type',
            ':last-of-type',
            ':only-child',
            ':only-of-type',
            ':hover',
            ':focus',
            ':active',
            ':visited',
            ':disabled',
            ':enabled',
            ':checked',
            ':empty',
            ':root',
            ':target',
            ':not',
            ':before',
            ':after',
            ':nth-last-child',
            ':nth-last-of-type',
          ]

          let isPseudoSelector = false
          for (const pseudo of pseudoSelectors) {
            const pseudoName = pseudo.substring(1)
            const afterColon = input.substring(j + 1, j + 1 + pseudoName.length)
            if (afterColon === pseudoName) {
              isPseudoSelector = true
              j += pseudoName.length
              break
            }
          }

          if (!isPseudoSelector) break
        } else if (input[j] === '[') {
          j++
          while (j < input.length && input[j] !== ']') {
            if (input[j] === '"' || input[j] === "'") {
              const quote = input[j]
              j++
              while (j < input.length && input[j] !== quote) {
                if (input[j] === '\\') j++
                j++
              }
            }
            j++
          }
          if (j < input.length && input[j] === ']') j++
        } else {
          j++
        }
      }
      value = input.substring(i, j)

      let type = TokenType.IDENTIFIER

      if (/^-?\d+(\.\d+)?$/.test(value)) {
        type = TokenType.NUMBER
      } else if (value === 'true' || value === 'false' || value === 'null') {
        type = TokenType.BOOLEAN
      } else if (/^[.#@\[]|[.#@\[]| /.test(value)) {
        type = TokenType.SELECTOR
      }

      tokens.push({ type, value, quoted: false })
      i = j
    }

    return tokens
  }

  function tokensToJSON(tokens) {
    let result = ''

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]

      if ('{}'.includes(token.type) || '[]'.includes(token.type)) {
        result += token.value
        continue
      }

      if (token.type === TokenType.COLON) {
        result += token.value
        continue
      }

      if (token.type === TokenType.COMMA) {
        result += token.value
        continue
      }

      if (token.type === TokenType.STRING && token.quoted) {
        result += `"${token.value}"`
        continue
      }

      if (token.type === TokenType.NUMBER || token.type === TokenType.BOOLEAN) {
        result += token.value
        continue
      }

      if (token.type === TokenType.SELECTOR || token.type === TokenType.IDENTIFIER) {
        result += `"${token.value}"`
        continue
      }

      result += `"${token.value}"`
    }

    return result
  }

  try {
    const tokens = tokenize(queryString)
    const jsonString = tokensToJSON(tokens)
    return JSON.parse(jsonString)
  } catch (error) {
    throw new RulesParseError('Invalid extraction rules syntax: ' + error.message, error)
  }
}
