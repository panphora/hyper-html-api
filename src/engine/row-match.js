/**
 * Map incoming list items onto the existing rows a list already has.
 *
 * A list arrives as plain JSON with no ids, so identity has to be inferred.
 * The rule this file follows is that a list creates a node only when it grows
 * and destroys one only when it shrinks: `matchRows` always pairs
 * min(newItems.length, oldValues.length) rows. Content decides WHICH old row a
 * new item is, never WHETHER it is one, because the field a person is editing
 * is the same field that would have to prove who the row is.
 *
 * Two passes:
 *   A. anchors, content appearing exactly once on each side is unambiguous and
 *      matches wherever it moved to (this is what carries a reorder)
 *   B. everything left over, aligned in order at minimum cost, so surviving
 *      rows keep their relative order and edits stay put
 */

export function matchRows(newItems, oldValues, shape, locked) {
  const n = newItems.length
  const m = oldValues.length
  const matches = new Array(n).fill(-1)
  // A caller that knows which old row an item is keeps that pairing; the passes
  // below only fill in what it did not answer for. Range-checked and deduped so
  // the min(n, m) guarantee in the header holds for any `locked`, not only the
  // sanitised one lockSuppliedRows produces.
  if (locked) {
    const seen = new Set()
    for (let i = 0; i < n; i++) {
      const j = locked[i]
      if (!(j >= 0 && j < m) || seen.has(j)) continue
      matches[i] = j
      seen.add(j)
    }
  }
  if (n === 0 || m === 0) return matches

  const newKeys = newItems.map((item) => itemKey(item, shape))
  const oldKeys = oldValues.map((item) => itemKey(item, shape))

  const takenOld = new Array(m).fill(false)
  for (const j of matches) if (j >= 0) takenOld[j] = true

  // Uniqueness is counted over the rows still in play, never over the locked
  // ones. A value can be duplicated across the whole list and still be the only
  // unlocked row of its kind, and that is exactly the case a lock should make
  // decidable: locking one of two identical rows leaves the other unambiguous.
  // Counting the locked rows too left it looking as ambiguous as before, and
  // since alignInOrder only ever produces order-preserving pairs, losing the
  // anchor loses the ability to express a crossing move at all.
  const oldByKey = new Map()
  oldKeys.forEach((key, j) => {
    if (takenOld[j]) return
    oldByKey.set(key, oldByKey.has(key) ? -1 : j)
  })
  const newCounts = new Map()
  newKeys.forEach((key, i) => {
    if (matches[i] >= 0) return
    newCounts.set(key, (newCounts.get(key) || 0) + 1)
  })

  newKeys.forEach((key, i) => {
    if (matches[i] >= 0) return
    if (newCounts.get(key) !== 1) return
    const j = oldByKey.get(key)
    if (j === undefined || j === -1 || takenOld[j]) return
    matches[i] = j
    takenOld[j] = true
  })

  const leftNew = []
  for (let i = 0; i < n; i++) if (matches[i] < 0) leftNew.push(i)
  const leftOld = []
  for (let j = 0; j < m; j++) if (!takenOld[j]) leftOld.push(j)
  if (leftNew.length === 0 || leftOld.length === 0) return matches

  // Changed content outranks displacement: the scale is larger than any total
  // displacement this list can produce, so position only ever breaks a tie.
  const scale = n * m + 1
  const cost = (i, j) => differingFields(newItems[i], oldValues[j], shape) * scale + Math.abs(i - j)
  for (const [i, j] of alignInOrder(leftNew, leftOld, cost)) matches[i] = j
  return matches
}

// An item is an object only when its shape is one. Both `".r[]"` and
// `[".r", "."]` produce string items, and Object.keys('.') is ["0"], which
// compared the first CHARACTER of two strings as though it were a field.
const isObjectShape = (shape) => typeof shape === 'object' && shape !== null

function itemKey(item, shape) {
  if (!isObjectShape(shape)) return item == null ? ' null' : String(item)
  const fields = Object.keys(shape)
  return JSON.stringify(
    fields.map((f) => {
      const encoded = JSON.stringify(item == null ? undefined : item[f])
      return encoded === undefined ? ' undef' : encoded
    }),
  )
}

function differingFields(a, b, shape) {
  if (!isObjectShape(shape)) return a === b ? 0 : 1
  const fields = Object.keys(shape)
  if (fields.length === 0) return 0
  let differing = 0
  for (const f of fields) {
    const av = JSON.stringify(a == null ? undefined : a[f])
    const bv = JSON.stringify(b == null ? undefined : b[f])
    if (av !== bv) differing++
  }
  return differing
}

// Pair every entry of the shorter list with one of the longer, keeping both in
// order and minimising total cost. Returns [newIndex, oldIndex] pairs.
function alignInOrder(newIdx, oldIdx, cost) {
  if (newIdx.length <= oldIdx.length) return align(newIdx, oldIdx, cost, false)
  return align(oldIdx, newIdx, (j, i) => cost(i, j), true)
}

function align(short, long, cost, flipped) {
  const s = short.length
  const l = long.length
  const table = []
  for (let i = 0; i <= s; i++) table.push(new Float64Array(l + 1).fill(Infinity))
  const takeHere = []
  for (let i = 0; i <= s; i++) takeHere.push(new Uint8Array(l + 1))
  for (let j = 0; j <= l; j++) table[s][j] = 0

  for (let i = s - 1; i >= 0; i--) {
    for (let j = l - 1; j >= 0; j--) {
      const take = cost(short[i], long[j]) + table[i + 1][j + 1]
      const skip = table[i][j + 1]
      if (take <= skip) {
        table[i][j] = take
        takeHere[i][j] = 1
      } else {
        table[i][j] = skip
      }
    }
  }

  const pairs = []
  let i = 0
  let j = 0
  while (i < s && j < l) {
    if (takeHere[i][j]) {
      pairs.push(flipped ? [long[j], short[i]] : [short[i], long[j]])
      i++
      j++
    } else {
      j++
    }
  }
  return pairs
}
