import { PageHeader, Card, Badge } from './ui';

/** Khung tạm cho màn hình chưa làm. Chủ sở hữu thay bằng màn hình thật trong pages/<thư-mục-của-mình>/index.jsx. */
export default function ComingSoon({ id, title, owner, sources }) {
  return (
    <>
      <PageHeader title={`${id} · ${title}`} subtitle="Màn hình này đang chờ được xây dựng." actions={<Badge tone="info">{owner}</Badge>} />
      <Card title="Cách bắt đầu">
        <ol className="steps">
          <li>Mở file <code>frontend/src/pages/{`s${id}-…`}/index.jsx</code> và thay phần nội dung bằng màn hình của bạn.</li>
          <li>Gọi API qua <code>api</code> trong <code>src/lib/api.js</code>, tải dữ liệu bằng hook <code>useApi</code>.</li>
          <li>Dùng sẵn các component trong <code>src/components</code> (PageHeader, Card, Stat, Badge, DataTable…).</li>
          <li>Đường dẫn, tên menu và quyền xem đã được khai báo trong <code>src/screens.js</code>, bạn không cần sửa file đó.</li>
        </ol>
        {sources && <p className="muted"><strong>Nguồn dữ liệu gợi ý:</strong> <code>{sources}</code></p>}
      </Card>
    </>
  );
}
