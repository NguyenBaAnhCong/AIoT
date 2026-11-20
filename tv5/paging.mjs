// The standalone demo keeps its array responses. Shared routes provide paging.
export async function pagedQuery(db, sql, values, paging, orderBy) {
  if (!paging) return (await db.query(sql + ' LIMIT 100', values)).rows;
  const { page, limit, offset } = paging;
  const { rows } = await db.query(`
    SELECT entries.*, count(*) OVER () AS __total FROM (${sql}) entries
    ORDER BY ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `, [...values, limit, offset]);
  let total = Number(rows[0]?.__total ?? 0);
  if (!rows.length && page > 1) {
    const result = await db.query(`SELECT count(*) AS total FROM (${sql}) entries`, values);
    total = Number(result.rows[0].total);
  }
  return {
    data: rows.map(({ __total, ...row }) => row),
    meta: { page, limit, total },
  };
}
