// 无声之声 · 手机端产品图标
// 统一为 24x24、1.75px 圆角单线 SVG；所有图标继承 currentColor，不依赖外部资源。

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'scene-default'
  | 'scene-work'
  | 'scene-dining'
  | 'scene-social'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'candidates'
  | 'speaking'
  | 'confirmed'
  | 'emergency'
  | 'ring-tap'
  | 'swipe-vertical'
  | 'ring-double-tap'
  | 'temple-double-tap'
  | 'offline'
  | 'mirror'
  | 'large-text'
  | 'timer'
  | 'settings';

type ShapeTag = 'circle' | 'line' | 'path' | 'polyline' | 'rect';

interface IconShape {
  tag: ShapeTag;
  attrs: Record<string, string>;
}

const ICONS: Record<IconName, readonly IconShape[]> = {
  'scene-default': [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } },
    { tag: 'path', attrs: { d: 'M12 3v3M12 18v3M3 12h3M18 12h3' } },
    { tag: 'path', attrs: { d: 'm5.6 5.6 2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1' } },
  ],
  'scene-work': [
    { tag: 'rect', attrs: { x: '3', y: '7', width: '18', height: '13', rx: '2.5' } },
    { tag: 'path', attrs: { d: 'M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 11.5c2.8 1.6 5.8 2.4 9 2.4s6.2-.8 9-2.4' } },
    { tag: 'line', attrs: { x1: '12', y1: '12.5', x2: '12', y2: '15.5' } },
  ],
  'scene-dining': [
    { tag: 'path', attrs: { d: 'M4 11h16a8 8 0 0 1-16 0Z' } },
    { tag: 'line', attrs: { x1: '8', y1: '20', x2: '16', y2: '20' } },
    { tag: 'path', attrs: { d: 'M8 8.5V4M11 8.5V3' } },
  ],
  'scene-social': [
    { tag: 'circle', attrs: { cx: '9', cy: '8', r: '3' } },
    { tag: 'circle', attrs: { cx: '17', cy: '9', r: '2.25' } },
    { tag: 'path', attrs: { d: 'M3.5 20v-2.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V20M14.5 14.4a4 4 0 0 1 6 3.4V20' } },
  ],
  idle: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '7' } },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '1.25' } },
  ],
  listening: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '2.25' } },
    { tag: 'path', attrs: { d: 'M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4' } },
  ],
  thinking: [
    { tag: 'circle', attrs: { cx: '6', cy: '12', r: '1.5' } },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '1.5' } },
    { tag: 'circle', attrs: { cx: '18', cy: '12', r: '1.5' } },
  ],
  candidates: [
    { tag: 'path', attrs: { d: 'M5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5.5 3v-3A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4Z' } },
    { tag: 'line', attrs: { x1: '7', y1: '8', x2: '17', y2: '8' } },
    { tag: 'line', attrs: { x1: '7', y1: '12', x2: '14.5', y2: '12' } },
  ],
  speaking: [
    { tag: 'path', attrs: { d: 'M4 10v4h4l5 4V6l-5 4H4Z' } },
    { tag: 'path', attrs: { d: 'M16 9a4.2 4.2 0 0 1 0 6M18.5 6.5a7.8 7.8 0 0 1 0 11' } },
  ],
  confirmed: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
    { tag: 'polyline', attrs: { points: '7.5 12.3 10.7 15.5 16.8 8.8' } },
  ],
  emergency: [
    { tag: 'path', attrs: { d: 'M10.2 4.1 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.8 4.1a2.1 2.1 0 0 0-3.6 0Z' } },
    { tag: 'line', attrs: { x1: '12', y1: '8.5', x2: '12', y2: '13.5' } },
    { tag: 'circle', attrs: { cx: '12', cy: '17', r: '.7', fill: 'currentColor', stroke: 'none' } },
  ],
  'ring-tap': [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '5.5' } },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '1.4' } },
    { tag: 'path', attrs: { d: 'M12 3.5V5M20.5 12H19M5 12H3.5' } },
  ],
  'swipe-vertical': [
    { tag: 'line', attrs: { x1: '12', y1: '5', x2: '12', y2: '19' } },
    { tag: 'polyline', attrs: { points: '8.5 8.5 12 5 15.5 8.5' } },
    { tag: 'polyline', attrs: { points: '8.5 15.5 12 19 15.5 15.5' } },
  ],
  'ring-double-tap': [
    { tag: 'circle', attrs: { cx: '9', cy: '12', r: '5' } },
    { tag: 'circle', attrs: { cx: '15', cy: '12', r: '5' } },
    { tag: 'circle', attrs: { cx: '9', cy: '12', r: '1' } },
    { tag: 'circle', attrs: { cx: '15', cy: '12', r: '1' } },
  ],
  'temple-double-tap': [
    { tag: 'path', attrs: { d: 'M3 11.5h2M19 11.5h2M9 11.5h6' } },
    { tag: 'circle', attrs: { cx: '7', cy: '13.5', r: '4' } },
    { tag: 'circle', attrs: { cx: '17', cy: '13.5', r: '4' } },
    { tag: 'path', attrs: { d: 'M18.5 5.5c1.6.7 2.7 2.2 3 3.9M17.8 8c.7.4 1.2 1 1.4 1.8' } },
  ],
  offline: [
    { tag: 'path', attrs: { d: 'M5.5 16.5A4 4 0 0 1 6 8.6 6.5 6.5 0 0 1 18.3 10a3.5 3.5 0 0 1 .2 6.9H9' } },
    { tag: 'line', attrs: { x1: '4', y1: '4', x2: '20', y2: '20' } },
  ],
  mirror: [
    { tag: 'rect', attrs: { x: '3', y: '5', width: '18', height: '12', rx: '2.5' } },
    { tag: 'line', attrs: { x1: '8', y1: '21', x2: '16', y2: '21' } },
    { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12', y2: '21' } },
    { tag: 'polyline', attrs: { points: '8 12 10.5 9.5 13 12 16 9' } },
  ],
  'large-text': [
    { tag: 'path', attrs: { d: 'm3 18 4-12 4 12M4.5 14h5' } },
    { tag: 'path', attrs: { d: 'm13 18 3-9 3 9M14.2 14.5h3.6' } },
  ],
  timer: [
    { tag: 'circle', attrs: { cx: '12', cy: '13', r: '8' } },
    { tag: 'line', attrs: { x1: '12', y1: '13', x2: '12', y2: '8.5' } },
    { tag: 'line', attrs: { x1: '12', y1: '13', x2: '15.5', y2: '15' } },
    { tag: 'line', attrs: { x1: '9', y1: '3', x2: '15', y2: '3' } },
  ],
  settings: [
    { tag: 'line', attrs: { x1: '4', y1: '7', x2: '20', y2: '7' } },
    { tag: 'line', attrs: { x1: '4', y1: '17', x2: '20', y2: '17' } },
    { tag: 'circle', attrs: { cx: '9', cy: '7', r: '2' } },
    { tag: 'circle', attrs: { cx: '15', cy: '17', r: '2' } },
  ],
};

function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, value);
}

/** 创建纯装饰 SVG；可访问名称始终由旁边的可见文字承担。 */
export function iconElement(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ui-icon');

  for (const shape of ICONS[name]) {
    const node = document.createElementNS(SVG_NS, shape.tag);
    for (const [key, value] of Object.entries(shape.attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
  }
  return svg;
}

/** 把一个静态图标安全地挂到指定容器，不解析任何用户文本。 */
export function renderIcon(host: Element, name: IconName): void {
  host.replaceChildren(iconElement(name));
  if (host instanceof HTMLElement) host.dataset.icon = name;
}

/** 初始化 HTML 中的 data-icon 占位；未知图标名保持为空。 */
export function mountIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((host) => {
    const name = host.dataset.icon;
    if (name && isIconName(name)) renderIcon(host, name);
  });
}
