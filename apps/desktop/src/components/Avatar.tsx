const COLORS = ['#ffb07a', '#7fdcae', '#f2d36b', '#ff9aa4', '#8cc2ff', '#c9a7f5', '#7dd7d3', '#c3cf7a'];

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return url
    ? <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <div className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</div>;
}
