
import { CanvasItem, Stroke, Widget, Point } from "../types";
import { TOOL_DEFAULTS } from "../constants";

export const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
  if (stroke.points.length < 2) return;
  
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;

  // Handle Styles
  const style = stroke.strokeStyle || 'solid';
  if (style === 'dashed') {
    ctx.setLineDash([10, 10]);
  } else if (style === 'dotted') {
    ctx.setLineDash([2, 8]);
  } else if (style === 'marker') {
    ctx.globalAlpha = 0.4; // Semi-transparent
    ctx.globalCompositeOperation = 'multiply'; // Blend effect
    ctx.lineCap = 'square'; // Marker tip
  } else {
    ctx.setLineDash([]);
  }

  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

  // Smooth curve
  for (let i = 1; i < stroke.points.length - 1; i++) {
    const p1 = stroke.points[i];
    const p2 = stroke.points[i + 1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
  }

  const last = stroke.points[stroke.points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
};

export const drawRuler = (ctx: CanvasRenderingContext2D, r: Widget) => {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate((r.angle * Math.PI) / 180);
  
  const w = r.width || TOOL_DEFAULTS.RULER.width;
  const h = r.height || TOOL_DEFAULTS.RULER.height;
  
  // Body
  ctx.fillStyle = 'rgba(255, 255, 220, 0.9)';
  ctx.strokeStyle = r.selected ? '#ef4444' : '#94a3b8';
  ctx.lineWidth = r.selected ? 2 : 1;
  
  ctx.fillRect(-w/2, -h/2, w, h);
  ctx.strokeRect(-w/2, -h/2, w, h);

  // Ticks
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  
  const startX = -w/2 + 10;
  const endX = w/2 - 10;
  const length = endX - startX;
  const step = 10; // px per tick

  for (let i = 0; i <= length / step; i++) {
    const x = startX + i * step;
    const isMajor = i % 5 === 0;
    const tickH = isMajor ? 15 : 8;
    
    ctx.beginPath();
    ctx.moveTo(x, -h/2);
    ctx.lineTo(x, -h/2 + tickH);
    ctx.stroke();

    if (isMajor) {
      ctx.fillText((i).toString(), x, -h/2 + 25);
    }
  }
  ctx.restore();
};

export const drawProtractor = (ctx: CanvasRenderingContext2D, p: Widget) => {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.angle * Math.PI) / 180);
  
  const r = p.radius || TOOL_DEFAULTS.PROTRACTOR.radius;
  
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0); // Top half
  ctx.closePath();
  
  ctx.fillStyle = 'rgba(200, 220, 255, 0.5)';
  ctx.fill();
  ctx.strokeStyle = p.selected ? '#ef4444' : '#94a3b8';
  ctx.lineWidth = p.selected ? 2 : 1;
  ctx.stroke();
  
  // Ticks
  for (let deg = 0; deg <= 180; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const renderRad = Math.PI - rad;
    
    const outerR = r;
    const innerR = r - (deg % 30 === 0 ? 15 : 8);
    
    const xOut = Math.cos(Math.PI + rad) * outerR; 
    const yOut = Math.sin(Math.PI + rad) * outerR;
    
    const xIn = Math.cos(Math.PI + rad) * innerR;
    const yIn = Math.sin(Math.PI + rad) * innerR;
    
    ctx.beginPath();
    ctx.moveTo(xOut, yOut); 
    ctx.lineTo(xIn, yIn);
    ctx.stroke();
  }
  
  ctx.restore();
};

export const drawCompass = (ctx: CanvasRenderingContext2D, c: Widget) => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((c.angle * Math.PI) / 180);
    
    const height = c.height || 150;
    const spread = 40; // Half width of opening
    
    ctx.strokeStyle = c.selected ? '#ef4444' : '#475569';
    ctx.lineWidth = c.selected ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Left Leg (Needle)
    ctx.beginPath();
    ctx.moveTo(0, 0); // Hinge
    ctx.lineTo(-spread, height);
    ctx.stroke();

    // Right Leg (Pencil)
    ctx.beginPath();
    ctx.moveTo(0, 0); // Hinge
    ctx.lineTo(spread, height);
    ctx.stroke();

    // Hinge head
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Needle Tip
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-spread, height, 3, 0, Math.PI * 2);
    ctx.fill();

    // Pencil Tip (Right)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(spread, height, 4, 0, Math.PI * 2);
    ctx.fill();

    // Dashed arc hint
    ctx.beginPath();
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.arc(-spread, height, spread * 2, 0, Math.PI, true); // Just a visual hint
    ctx.stroke();

    ctx.restore();
};

export const drawSetSquare = (ctx: CanvasRenderingContext2D, t: Widget) => {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate((t.angle * Math.PI) / 180);
    
    const w = t.width || TOOL_DEFAULTS.TRIANGLE.width;
    const h = t.height || TOOL_DEFAULTS.TRIANGLE.height;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, h);
    ctx.closePath();

    ctx.fillStyle = 'rgba(200, 255, 200, 0.5)';
    ctx.fill();
    ctx.strokeStyle = t.selected ? '#ef4444' : '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ruler markings on sides
    ctx.beginPath();
    for(let i=0; i<w; i+=20) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 10);
    }
    for(let i=0; i<h; i+=20) {
        ctx.moveTo(0, i);
        ctx.lineTo(10, i);
    }
    ctx.stroke();

    ctx.restore();
};

export const drawImageWidget = (ctx: CanvasRenderingContext2D, imgW: Widget) => {
    if (!imgW.src) return;
    const img = new Image();
    img.src = imgW.src;
    
    if (img.complete) {
        ctx.save();
        ctx.translate(imgW.x, imgW.y);
        ctx.rotate((imgW.angle * Math.PI) / 180);
        ctx.scale(imgW.scale, imgW.scale);
        
        const w = imgW.width || 100;
        const h = imgW.height || 100;
        
        ctx.drawImage(img, -w/2, -h/2, w, h);
        
        if (imgW.selected) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.strokeRect(-w/2, -h/2, w, h);
        }
        ctx.restore();
    }
};

export const drawTextWidget = (ctx: CanvasRenderingContext2D, t: Widget) => {
    if (!t.text) return;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate((t.angle * Math.PI) / 180);
    
    ctx.font = '18px sans-serif';
    ctx.fillStyle = t.selected ? '#ef4444' : '#000';
    ctx.fillText(t.text, 0, 0);
    
    if (t.selected) {
        const m = ctx.measureText(t.text);
        ctx.strokeStyle = '#ef4444';
        ctx.strokeRect(-5, -18, m.width + 10, 24);
    }
    ctx.restore();
};

// --- SNAPPING UTILS ---

export const getSnapPoint = (x: number, y: number, items: CanvasItem[], threshold = 20): Point | null => {
  for (const item of items) {
    // Ignore hidden widgets
    if ((item as Widget).visible === false) continue;

    if (item.type === 'ruler' || item.type === 'triangle') {
      const widget = item as Widget;
      const w = widget.width || 100;
      const h = widget.height || 50;
      const rad = (widget.angle * Math.PI) / 180;
      const cos = Math.cos(-rad); // Rotate opposite to align to local axis
      const sin = Math.sin(-rad);

      // Translate to local coordinates (center at 0,0)
      const dx = x - widget.x;
      const dy = y - widget.y;

      // Rotate point to local alignment
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      // Check bounds for Ruler
      if (item.type === 'ruler') {
        // Check X within length (with some margin)
        if (localX >= -w/2 - threshold && localX <= w/2 + threshold) {
          // Check Y near top edge (-h/2)
          if (Math.abs(localY - (-h/2)) < threshold) {
             return convertLocalToWorld(localX, -h/2, widget.x, widget.y, rad);
          }
          // Check Y near bottom edge (h/2)
          if (Math.abs(localY - (h/2)) < threshold) {
            return convertLocalToWorld(localX, h/2, widget.x, widget.y, rad);
          }
        }
      }

      // Check bounds for Set Square (Triangle)
      // Simplified: Snap to legs
      if (item.type === 'triangle') {
        // Horizontal leg (Top edge in local coords: y=0, x from 0 to w)
        if (localX >= 0 - threshold && localX <= w + threshold) {
           if (Math.abs(localY) < threshold) {
             return convertLocalToWorld(localX, 0, widget.x, widget.y, rad);
           }
        }
        // Vertical leg (Left edge in local coords: x=0, y from 0 to h)
        if (localY >= 0 - threshold && localY <= h + threshold) {
           if (Math.abs(localX) < threshold) {
             return convertLocalToWorld(0, localY, widget.x, widget.y, rad);
           }
        }
      }
    }
  }
  return null;
};

// Get the Needle and Pencil Tip world coordinates for the Compass
export const getCompassPoints = (c: Widget) => {
    const height = c.height || 150;
    const spread = 40; 
    const rad = (c.angle * Math.PI) / 180;
    
    // Needle (Left Leg) Local: (-spread, height)
    // Pencil (Right Leg) Local: (spread, height)
    
    return {
        needle: convertLocalToWorld(-spread, height, c.x, c.y, rad),
        pencil: convertLocalToWorld(spread, height, c.x, c.y, rad)
    };
}

const convertLocalToWorld = (lx: number, ly: number, cx: number, cy: number, rad: number): Point => {
  // Reverse rotation
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  const wx = lx * cos - ly * sin + cx;
  const wy = lx * sin + ly * cos + cy;
  return { x: wx, y: wy };
}