import { EmptyState, Spinner } from './Feedback';

/**
 * Bảng dữ liệu đơn giản.
 *   <DataTable
 *     columns={[{ key: 'name', title: 'Tên' }, { key: 'status', title: 'Trạng thái', render: (row) => <Badge>{row.status}</Badge> }]}
 *     rows={data} loading={loading} rowKey="id" />
 */
export default function DataTable({ columns, rows, loading, rowKey = 'id', empty }) {
  if (loading) return <Spinner />;
  if (!rows?.length) return <EmptyState {...empty} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.title}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[rowKey] ?? i}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
