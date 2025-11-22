
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CanvasItem, Stroke, ToolMode, Widget, AIResult, MathType, StrokeStyle } from './types';
import { COLORS, STROKE_WIDTHS, TOOL_DEFAULTS } from './constants';
import { drawStroke, drawRuler, drawProtractor, drawSetSquare, drawCompass, drawImageWidget, drawTextWidget, getSnapPoint, getCompassPoints } from './components/CanvasUtils';
import { solveMathFromImage, generateTikzCode } from './services/geminiService';
import { compileTikz } from './services/tikzService';
import { v4 as uuidv4 } from 'uuid';

// Icons
import { 
  FaMousePointer, FaPen, FaEraser, FaFont, FaRuler, FaDraftingCompass, 
  FaShapes, FaMagnet, FaTrash, FaSave, FaRobot, FaCalculator, FaChartLine, 
  FaImage, FaTimes, FaCheckCircle, FaPaste, FaHighlighter, FaGripLines, FaEllipsisH, FaCircleNotch,
  FaLayerGroup, FaEye, FaEyeSlash
} from 'react-icons/fa';
import { MdOutlineLinearScale, MdBorderStyle } from "react-icons/md";

const App: React.FC = () => {
  // -- State --
  const [mode, setMode] = useState<ToolMode>('select');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState<number>(STROKE_WIDTHS[1]);
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid');
  
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [snap, setSnap] = useState<boolean>(true);
  const [grid, setGrid] = useState<boolean>(true);
  
  // AI Panel State
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<AIResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [promptText, setPromptText] = useState("Solve this math problem step-by-step.");
  
  // Modals & Panels
  const [tikzModalOpen, setTikzModalOpen] = useState(false);
  const [tikzDesc, setTikzDesc] = useState("");
  const [tikzType, setTikzType] = useState<MathType>(MathType.BBT);
  
  const [showResultModal, setShowResultModal] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interaction Refs
  const isDragging = useRef(false);
  const dragType = useRef<'move' | 'rotate' | 'compass_arc' | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const selectedItemId = useRef<string | null>(null);
  const compassPivot = useRef<{x: number, y: number} | null>(null); // For locking needle during rotation

  // -- Canvas Logic --

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid
    if (grid) {
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      const step = 50;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
    }

    // Items
    items.forEach(item => {
      // Check visibility
      if ((item as Widget).visible === false) return;

      if (item.type === 'stroke') drawStroke(ctx, item as Stroke);
      else if (item.type === 'ruler') drawRuler(ctx, item as Widget);
      else if (item.type === 'protractor') drawProtractor(ctx, item as Widget);
      else if (item.type === 'triangle') drawSetSquare(ctx, item as Widget);
      else if (item.type === 'compass') drawCompass(ctx, item as Widget);
      else if (item.type === 'image') drawImageWidget(ctx, item as Widget);
      else if (item.type === 'text') drawTextWidget(ctx, item as Widget);
    });

    // Current Stroke
    if (currentStroke) {
      drawStroke(ctx, currentStroke);
    }
  }, [items, currentStroke, grid]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Handle Window Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        renderCanvas();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // -- Input Handlers --

  const getMousePos = (e: React.MouseEvent | MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    let { x, y } = getMousePos(e);
    const isRightClick = e.button === 2;

    // 1. Hit Test (Ignore hidden items)
    const clickedItem = [...items].reverse().find(item => {
        if ((item as Widget).visible === false) return false; // Skip hidden
        if (item.type === 'stroke') return false; 
        const w = (item as Widget);
        const dx = x - w.x;
        const dy = y - w.y;
        return Math.hypot(dx, dy) < 100; 
    });

    if (clickedItem) {
        selectedItemId.current = clickedItem.id;
        setItems(prev => prev.map(i => ({ ...i, selected: i.id === clickedItem.id })));
        
        if (isRightClick) {
            // Right Click Logic
            if (clickedItem.type === 'compass') {
                // Start Drawing Arc
                dragType.current = 'compass_arc';
                const points = getCompassPoints(clickedItem as Widget);
                compassPivot.current = points.needle; // Lock rotation around needle

                // Start the stroke at the pencil tip
                setCurrentStroke({
                    id: uuidv4(),
                    type: 'stroke',
                    points: [points.pencil],
                    color: color,
                    width: width,
                    strokeStyle: strokeStyle
                });
            } else {
                // Start Rotation for other tools
                dragType.current = 'rotate';
            }
        } else {
            // Left Click Logic (Move)
            if (mode === 'select') {
                dragType.current = 'move';
            }
        }
    } else {
        // No item clicked
        if (mode === 'select') {
            selectedItemId.current = null;
            setItems(prev => prev.map(i => ({ ...i, selected: false })));
            dragType.current = null;
        }
    }

    // Pen Mode Logic (Left Click only)
    if (!isRightClick && mode === 'pen') {
        // Snap Logic
        if (snap) {
            const snapPos = getSnapPoint(x, y, items);
            if (snapPos) {
                x = snapPos.x;
                y = snapPos.y;
            }
        }
        setCurrentStroke({
            id: uuidv4(),
            type: 'stroke',
            points: [{ x, y }],
            color,
            width,
            strokeStyle
        });
        dragType.current = null; // Handled by native pen logic
    }
    
    // Eraser
    if (mode === 'eraser') {
        dragType.current = null;
    }

    lastPos.current = { x, y };
    isDragging.current = true;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    let { x, y } = getMousePos(e);

    // --- 1. Right Click Actions (Rotate or Compass Draw) ---
    if (dragType.current === 'compass_arc' && selectedItemId.current && compassPivot.current) {
        // Rotate compass around needle tip based on mouse position
        const pivot = compassPivot.current;
        
        // Angle from Pivot (Needle) to Mouse
        const dx = x - pivot.x;
        const dy = y - pivot.y;
        const mouseAngle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Calculate Angle Change
        const oldDx = lastPos.current.x - pivot.x;
        const oldDy = lastPos.current.y - pivot.y;
        const oldAngle = Math.atan2(oldDy, oldDx) * 180 / Math.PI;
        const deltaAngle = mouseAngle - oldAngle;

        setItems(prev => prev.map(item => {
            if (item.id === selectedItemId.current) {
                const w = item as Widget;
                const newAngle = w.angle + deltaAngle;
                
                const spread = 40;
                const height = w.height || 150;
                const rad = (newAngle * Math.PI) / 180;
                
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                
                const vX = -spread * cos - height * sin;
                const vY = -spread * sin + height * cos;
                
                const newCx = pivot.x - vX;
                const newCy = pivot.y - vY;

                return { ...item, angle: newAngle, x: newCx, y: newCy };
            }
            return item;
        }));
        
        // Re-calc new angle/center locally to draw stroke
        const currentItem = items.find(i => i.id === selectedItemId.current) as Widget;
        if (currentItem) {
             const newAngle = currentItem.angle + deltaAngle;
             const spread = 40;
             const height = currentItem.height || 150;
             const rad = (newAngle * Math.PI) / 180;
             
             const cos = Math.cos(rad);
             const sin = Math.sin(rad);

             // Recalculate center (though we just set it above, state updates are async, so safest to use math)
             const vX = -spread * cos - height * sin;
             const vY = -spread * sin + height * cos;
             const newCx = pivot.x - vX;
             const newCy = pivot.y - vY;

             // Pencil Local: (spread, height)
             const pX = spread * cos - height * sin + newCx;
             const pY = spread * sin + height * cos + newCy;

             setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x: pX, y: pY }] } : null);
        }

    } else if (dragType.current === 'rotate' && selectedItemId.current) {
        // Generic Rotation via Right Drag
        // Use vertical movement to rotate
        const deltaY = y - lastPos.current.y;
        const rotationSpeed = 0.5;
        
        setItems(prev => prev.map(item => {
            if (item.id === selectedItemId.current) {
                const w = item as Widget;
                return { ...w, angle: w.angle + deltaY * rotationSpeed };
            }
            return item;
        }));
    }

    // --- 2. Left Click Actions ---
    else if (mode === 'pen' && currentStroke) {
      // Snap Logic
      if (snap) {
          const snapPos = getSnapPoint(x, y, items);
          if (snapPos) {
              x = snapPos.x;
              y = snapPos.y;
          }
      }
      setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, { x, y }] } : null);
    } 
    else if (dragType.current === 'move' && selectedItemId.current) {
      const dx = x - lastPos.current.x;
      const dy = y - lastPos.current.y;
      setItems(prev => prev.map(item => {
        if (item.id === selectedItemId.current) {
          return { ...item, x: (item as Widget).x + dx, y: (item as Widget).y + dy };
        }
        return item;
      }));
    } 
    else if (mode === 'eraser') {
        setItems(prev => prev.filter(item => {
            // Only erase strokes, not widgets (unless we want to)
            if ((item as Widget).visible === false) return true; // Don't erase hidden

            if (item.type === 'stroke') {
                const s = item as Stroke;
                return !s.points.some(p => Math.hypot(p.x - x, p.y - y) < 20);
            }
            return true;
        }));
    }

    lastPos.current = { x, y };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    
    // Finalize Compass Stroke
    if (dragType.current === 'compass_arc' && currentStroke) {
        setItems(prev => [...prev, currentStroke]);
        setCurrentStroke(null);
    }
    // Finalize Pen Stroke
    else if (mode === 'pen' && currentStroke) {
      setItems(prev => [...prev, currentStroke]);
      setCurrentStroke(null);
    }

    dragType.current = null;
    compassPivot.current = null;
  };

  // Mouse Wheel for Rotation (Alternative)
  const handleWheel = (e: React.WheelEvent) => {
    if (selectedItemId.current) {
        const delta = Math.sign(e.deltaY) * 5; 
        setItems(prev => prev.map(item => {
            if (item.id === selectedItemId.current && item.type !== 'stroke') {
                const w = item as Widget;
                return { ...w, angle: (w.angle || 0) + delta };
            }
            return item;
        }));
    }
  };

  // -- Tools Logic --

  const addWidget = (type: Widget['type']) => {
    // Singleton Logic for measurement tools
    const singletons = ['ruler', 'protractor', 'triangle', 'compass'];
    if (singletons.includes(type)) {
      const existingIndex = items.findIndex(i => i.type === type);
      if (existingIndex !== -1) {
        const existing = items[existingIndex] as Widget;
        const willBeVisible = existing.visible === false; // If it was hidden (false), it becomes visible (true). If undefined/true, it becomes false.
        
        setItems(prev => prev.map((i, idx) => {
            if (idx === existingIndex) {
                return { ...i, visible: willBeVisible, selected: willBeVisible };
            }
            return { ...i, selected: false }; // Deselect others if showing
        }));

        if (willBeVisible) {
            selectedItemId.current = existing.id;
            setMode('select');
        } else {
            if (selectedItemId.current === existing.id) {
                selectedItemId.current = null;
            }
        }
        return;
      }
    }

    // Standard Creation Logic (for first time or non-singletons)
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width / 2 : 400;
    const cy = canvas ? canvas.height / 2 : 300;
    
    const widget: Widget = {
      id: uuidv4(),
      type,
      x: cx,
      y: cy,
      angle: 0,
      scale: 1,
      selected: true,
      visible: true, // Default visible
      width: type === 'ruler' ? TOOL_DEFAULTS.RULER.width : (type === 'triangle' ? TOOL_DEFAULTS.TRIANGLE.width : undefined),
      height: type === 'ruler' ? TOOL_DEFAULTS.RULER.height : (type === 'triangle' ? TOOL_DEFAULTS.TRIANGLE.height : (type === 'compass' ? TOOL_DEFAULTS.COMPASS.height : undefined)),
      radius: type === 'protractor' ? TOOL_DEFAULTS.PROTRACTOR.radius : undefined
    };
    
    setMode('select');
    setItems(prev => [...prev.map(i => ({...i, selected: false})), widget]);
    selectedItemId.current = widget.id;
  };

  const toggleVisibility = (id: string) => {
      setItems(prev => prev.map(item => {
          if (item.id === id) {
              return { ...item, visible: !(item as Widget).visible };
          }
          return item;
      }));
  };

  const deleteItem = (id: string) => {
      setItems(prev => prev.filter(i => i.id !== id));
  };
  
  const isToolVisible = (type: Widget['type']) => {
      return items.some(i => i.type === type && (i as Widget).visible !== false);
  };

  // -- Paste Logic --

  // 1. Paste to Canvas (Ctrl+V)
  const handleCanvasPaste = useCallback((e: ClipboardEvent) => {
    // Only paste to canvas if we are NOT focusing an input/textarea in the AI panel
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            // Add to Canvas
            const img = new Image();
            img.onload = () => {
                const widget: Widget = {
                    id: uuidv4(),
                    type: 'image',
                    x: canvasRef.current?.width ? canvasRef.current.width / 2 : 300,
                    y: canvasRef.current?.height ? canvasRef.current.height / 2 : 300,
                    angle: 0,
                    scale: 0.5, 
                    selected: true,
                    visible: true,
                    src: base64,
                    width: img.width,
                    height: img.height
                };
                setItems(prev => [...prev, widget]);
                setMode('select');
            };
            img.src = base64;
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, []);

  // 2. Paste to AI (Button Click)
  const handleAIPaste = async () => {
    try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
            const imageTypes = item.types.filter(type => type.startsWith('image/'));
            if (imageTypes.length > 0) {
                const blob = await item.getType(imageTypes[0]);
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const base64 = ev.target?.result as string;
                    setPastedImage(base64);
                    setAiPanelOpen(true);
                };
                reader.readAsDataURL(blob);
                return; // Only take the first image
            }
        }
        alert("No image found in clipboard.");
    } catch (err) {
        console.error(err);
        alert("Failed to read clipboard. Please allow permissions.");
    }
  };

  useEffect(() => {
    document.addEventListener('paste', handleCanvasPaste);
    return () => document.removeEventListener('paste', handleCanvasPaste);
  }, [handleCanvasPaste]);

  // -- AI Interactions --

  const handleSolve = async () => {
    if (!pastedImage) {
      alert("Please paste an image into the AI Panel first.");
      return;
    }
    setIsProcessing(true);
    try {
      const base64Data = pastedImage.split(',')[1];
      const result = await solveMathFromImage(base64Data, promptText);
      setOcrResult(result);
      setShowResultModal(true); 
    } catch (e) {
      alert("Error processing image. Check API Key.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Typeset math when result modal opens
  useEffect(() => {
    if (showResultModal && ocrResult && (window as any).MathJax) {
        setTimeout(() => {
            (window as any).MathJax.typesetPromise();
        }, 100);
    }
  }, [showResultModal, ocrResult]);

  const handleGenerateTikz = async () => {
    setIsProcessing(true);
    try {
      const code = await generateTikzCode(tikzDesc, tikzType);
      const base64Img = await compileTikz(code);
      
      const fullSrc = `data:image/png;base64,${base64Img}`;
      const img = new Image();
      img.onload = () => {
        const widget: Widget = {
            id: uuidv4(),
            type: 'image',
            x: canvasRef.current?.width ? canvasRef.current.width / 2 : 400,
            y: canvasRef.current?.height ? canvasRef.current.height / 2 : 300,
            angle: 0,
            scale: 1,
            selected: true,
            visible: true,
            src: fullSrc,
            width: img.width,
            height: img.height
        };
        setItems(prev => [...prev, widget]);
      };
      img.src = fullSrc;
      
      setTikzModalOpen(false);
    } catch (e) {
      alert("Failed to generate or compile TikZ. Try a simpler description.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter for Layer Panel (Only Widgets)
  const widgetItems = items.filter(i => i.type !== 'stroke') as Widget[];

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-teal-600 text-white p-4 shadow-lg flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <FaCalculator className="text-2xl" />
          <div>
            <h1 className="text-xl font-bold">Teaching Board AI</h1>
            <p className="text-xs text-teal-100">Gemini 2.5 Flash • TikZ • OCR</p>
          </div>
        </div>
        <div className="flex gap-4 text-sm font-semibold">
          <span className={`px-3 py-1 rounded-full ${process.env.API_KEY ? 'bg-green-500' : 'bg-red-500'}`}>
            API Key: {process.env.API_KEY ? 'Configured' : 'Missing'}
          </span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Toolbar */}
        <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-3 shadow-sm z-10 overflow-y-auto">
          <ToolBtn icon={<FaMousePointer />} active={mode === 'select'} onClick={() => setMode('select')} label="Select" />
          <ToolBtn icon={<FaPen />} active={mode === 'pen'} onClick={() => setMode('pen')} label="Pen" />
          <ToolBtn icon={<FaEraser />} active={mode === 'eraser'} onClick={() => setMode('eraser')} label="Eraser" />
          <div className="h-px w-8 bg-slate-200 my-1"></div>
          
          {/* Singleton Measurement Tools */}
          <ToolBtn 
            icon={<FaRuler />} 
            active={isToolVisible('ruler')} 
            onClick={() => addWidget('ruler')} 
            label="Ruler" 
          />
          <ToolBtn 
            icon={<FaDraftingCompass />} 
            active={isToolVisible('compass')} 
            onClick={() => addWidget('compass')} 
            label="Compass (Right Click to Draw)" 
          />
          <ToolBtn 
            icon={<FaShapes />} 
            active={isToolVisible('triangle')} 
            onClick={() => addWidget('triangle')} 
            label="Set Square" 
          />
          <ToolBtn 
            icon={<FaCircleNotch />} 
            active={isToolVisible('protractor')} 
            onClick={() => addWidget('protractor')} 
            label="Protractor" 
          />
          
          <ToolBtn icon={<FaFont />} onClick={() => addWidget('text')} label="Text" />
          <div className="h-px w-8 bg-slate-200 my-1"></div>
          <ToolBtn icon={<FaChartLine />} onClick={() => setTikzModalOpen(true)} label="TikZ" />
          
          {/* Manage Layers/Visibility */}
          <div className="relative">
             <ToolBtn 
                icon={<FaLayerGroup />} 
                active={showLayerPanel} 
                onClick={() => setShowLayerPanel(!showLayerPanel)} 
                label="Manage Tools (Visibility)" 
                color="text-blue-500"
             />
             
             {/* Floating Layer Panel */}
             {showLayerPanel && (
                <div className="absolute left-14 top-0 w-64 bg-white shadow-xl border rounded-lg p-3 z-50 animate-in fade-in slide-in-from-left-5">
                    <h3 className="font-bold text-sm text-slate-700 mb-2 flex justify-between items-center">
                        <span>Active Tools</span>
                        <button onClick={() => setShowLayerPanel(false)} className="text-slate-400 hover:text-slate-600"><FaTimes/></button>
                    </h3>
                    <div className="max-h-60 overflow-y-auto flex flex-col gap-2">
                        {widgetItems.length === 0 ? (
                            <p className="text-xs text-slate-400 italic p-2 text-center">No tools added.</p>
                        ) : (
                            widgetItems.map((w, idx) => (
                                <div key={w.id} className={`flex items-center justify-between p-2 rounded border ${w.selected ? 'border-teal-500 bg-teal-50' : 'border-slate-100 hover:bg-slate-50'}`}>
                                    <div className="flex items-center gap-2 text-sm text-slate-700 truncate cursor-pointer" onClick={() => {
                                        setItems(prev => prev.map(i => ({...i, selected: i.id === w.id})));
                                        selectedItemId.current = w.id;
                                    }}>
                                        <span className="text-slate-400 text-xs">
                                            {w.type === 'ruler' && <FaRuler/>}
                                            {w.type === 'compass' && <FaDraftingCompass/>}
                                            {w.type === 'triangle' && <FaShapes/>}
                                            {w.type === 'protractor' && <FaCircleNotch/>}
                                            {w.type === 'image' && <FaImage/>}
                                            {w.type === 'text' && <FaFont/>}
                                        </span>
                                        <span className="capitalize truncate w-24">{w.type} {idx+1}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleVisibility(w.id); }}
                                            className={`p-1.5 rounded hover:bg-slate-200 ${w.visible === false ? 'text-slate-400' : 'text-teal-600'}`}
                                            title={w.visible === false ? "Show" : "Hide"}
                                        >
                                            {w.visible === false ? <FaEyeSlash size={12}/> : <FaEye size={12}/>}
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); deleteItem(w.id); }}
                                            className="p-1.5 rounded hover:bg-red-100 text-red-400 hover:text-red-600"
                                            title="Delete"
                                        >
                                            <FaTrash size={12}/>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
             )}
          </div>

          <ToolBtn icon={<FaTrash />} onClick={() => setItems([])} color="text-red-500" label="Clear Board" />
        </div>

        {/* Properties Bar */}
        <div className="absolute top-4 left-20 bg-white/90 backdrop-blur p-2 rounded-lg shadow border border-slate-200 flex gap-3 items-center z-10 flex-wrap">
          {/* Color Picker */}
          {COLORS.map(c => (
            <button 
              key={c}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <div className="w-px h-6 bg-slate-300 mx-1"></div>
          
          {/* Stroke Width */}
          {STROKE_WIDTHS.map(w => (
            <button
              key={w}
              className={`w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 ${width === w ? 'bg-slate-200' : ''}`}
              onClick={() => setWidth(w)}
            >
              <div className="bg-slate-800 rounded-full" style={{ width: w, height: w }} />
            </button>
          ))}

          <div className="w-px h-6 bg-slate-300 mx-1"></div>
          
          {/* Stroke Style */}
          <button className={`p-1 rounded ${strokeStyle === 'solid' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} onClick={() => setStrokeStyle('solid')} title="Solid Pen">
            <MdOutlineLinearScale className="text-lg"/>
          </button>
          <button className={`p-1 rounded ${strokeStyle === 'marker' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} onClick={() => setStrokeStyle('marker')} title="Highlighter">
            <FaHighlighter className="text-lg"/>
          </button>
          <button className={`p-1 rounded ${strokeStyle === 'dashed' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} onClick={() => setStrokeStyle('dashed')} title="Dashed Line">
            <MdBorderStyle className="text-lg"/>
          </button>
           <button className={`p-1 rounded ${strokeStyle === 'dotted' ? 'bg-slate-200' : 'hover:bg-slate-100'}`} onClick={() => setStrokeStyle('dotted')} title="Dotted Line">
            <FaEllipsisH className="text-lg"/>
          </button>

          <div className="w-px h-6 bg-slate-300 mx-1"></div>
          
          <button 
            className={`p-1 rounded ${snap ? 'bg-teal-100 text-teal-700' : 'text-slate-400'}`}
            onClick={() => setSnap(!snap)}
            title="Snap to Ruler (Bắt dính)"
          >
            <FaMagnet className="text-lg"/>
          </button>
          <button 
            className={`p-1 rounded ${grid ? 'bg-teal-100 text-teal-700' : 'text-slate-400'}`}
            onClick={() => setGrid(!grid)}
            title="Grid"
          >
            <FaGripLines className="text-lg"/>
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-slate-100 relative cursor-crosshair" ref={containerRef}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()} // Disable context menu
            className="absolute top-0 left-0 touch-none"
          />
          <div className="absolute bottom-4 left-4 text-slate-400 text-xs pointer-events-none select-none bg-white/80 p-2 rounded backdrop-blur">
            <b>Left Click:</b> Move / Draw • <b>Right Click:</b> Rotate Tool / Draw Compass Arc • <b>Wheel:</b> Rotate
          </div>
        </div>

        {/* Sidebar */}
        <div className={`bg-white border-l border-slate-200 flex flex-col shadow-xl transition-all duration-300 ${aiPanelOpen ? 'w-96' : 'w-12'}`}>
            <button 
                className="p-3 bg-slate-50 border-b flex justify-between items-center hover:bg-slate-100"
                onClick={() => setAiPanelOpen(!aiPanelOpen)}
            >
                {aiPanelOpen && <span className="font-bold text-slate-700 flex gap-2 items-center"><FaRobot className="text-teal-600"/> AI Solver</span>}
                <span>{aiPanelOpen ? '›' : '‹'}</span>
            </button>
            
            {aiPanelOpen && (
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {/* Input Section */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-semibold text-sm text-slate-500 uppercase">1. Input Math</h3>
                            <button 
                                onClick={handleAIPaste} 
                                className="text-xs bg-white border-2 border-teal-100 hover:border-teal-300 text-teal-700 px-3 py-1 rounded-full flex items-center gap-1 font-medium transition"
                                title="Click here to paste image for AI processing"
                            >
                                <FaPaste /> Paste to AI
                            </button>
                        </div>
                        {pastedImage ? (
                             <div className="relative group">
                                <img src={pastedImage} alt="Paste" className="w-full h-40 object-contain border bg-white rounded shadow-sm" />
                                <button 
                                    onClick={() => setPastedImage(null)}
                                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition"
                                >
                                    <FaTrash size={12}/>
                                </button>
                             </div>
                        ) : (
                            <div 
                                className="h-32 border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-400 bg-white hover:bg-slate-50 cursor-pointer transition"
                                onClick={handleAIPaste}
                            >
                                <FaImage className="text-2xl mb-2" />
                                <span className="text-sm text-center px-2">Click "Paste to AI"<br/>to solve math image</span>
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-2 text-center">
                            Note: Ctrl+V pastes to Whiteboard. Use button above for AI.
                        </p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h3 className="font-semibold text-sm text-slate-500 mb-2 uppercase">2. Prompt</h3>
                        <textarea 
                            className="w-full p-2 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-teal-500 mb-2"
                            rows={3}
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                        />
                        <button 
                            onClick={handleSolve}
                            disabled={isProcessing || !pastedImage}
                            className="w-full py-2 bg-teal-600 text-white rounded font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-md transform active:scale-95 transition"
                        >
                            {isProcessing ? 'Thinking...' : <><FaRobot /> Solve with Gemini</>}
                        </button>
                    </div>

                    {/* Previous Results Summary (Optional) */}
                    {ocrResult && !showResultModal && (
                        <div className="bg-blue-50 p-3 rounded border border-blue-200 text-sm text-center cursor-pointer hover:bg-blue-100 text-blue-700 font-medium" onClick={() => setShowResultModal(true)}>
                           <FaCheckCircle className="inline mr-2"/> Show Last Result
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* TikZ Modal */}
      {tikzModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FaChartLine className="text-teal-600"/> Generate Math Diagram (TikZ)
            </h2>
            
            <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Diagram Type</label>
                <div className="flex gap-2">
                    {[MathType.BBT, MathType.GRAPH, MathType.CHART].map(t => (
                        <button 
                            key={t}
                            onClick={() => setTikzType(t)}
                            className={`flex-1 py-2 text-sm border rounded ${tikzType === t ? 'bg-teal-50 border-teal-500 text-teal-700 font-medium' : 'hover:bg-slate-50'}`}
                        >
                            {t === 'bbt' ? 'Table' : (t === 'graph' ? 'Graph' : 'Chart')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                    className="w-full p-3 border rounded focus:ring-2 focus:ring-teal-500 outline-none"
                    rows={4}
                    placeholder="e.g., Graph for y = x^3 - 3x with domain [-3, 3]"
                    value={tikzDesc}
                    onChange={(e) => setTikzDesc(e.target.value)}
                />
            </div>

            <div className="flex justify-end gap-3">
                <button 
                    onClick={() => setTikzModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleGenerateTikz}
                    disabled={isProcessing}
                    className="px-6 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
                >
                    {isProcessing ? 'Generating...' : 'Generate & Add to Board'}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Modal (Professional Math Display) */}
      {showResultModal && ocrResult && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-[900px] max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            
            {/* Modal Header */}
            <div className="bg-teal-600 text-white p-4 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <FaCalculator /> Math Solution Result
                </h2>
                <button onClick={() => setShowResultModal(false)} className="text-white hover:text-red-200 text-xl transition">
                    <FaTimes />
                </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 flex gap-6 bg-slate-50">
                
                {/* Left: OCR Raw */}
                <div className="w-1/3 flex flex-col gap-2">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2 uppercase text-xs tracking-wider">
                        <span className="w-2 h-4 bg-green-500 rounded-sm"></span> OCR Text
                    </h3>
                    <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 text-xs font-mono text-slate-600 whitespace-pre-wrap shadow-sm overflow-auto">
                        {ocrResult.ocr}
                    </div>
                </div>

                {/* Right: Solution */}
                <div className="w-2/3 flex flex-col gap-2">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2 uppercase text-xs tracking-wider">
                        <span className="w-2 h-4 bg-blue-500 rounded-sm"></span> Detailed Solution
                    </h3>
                    <div className="flex-1 bg-white border border-slate-200 rounded-lg p-6 text-slate-800 shadow-sm overflow-auto">
                         {/* Math content container */}
                         <div 
                            className="prose prose-slate max-w-none"
                            dangerouslySetInnerHTML={{ 
                                __html: ocrResult.solution
                                    .replace(/\n/g, '<br/>')
                                    // Basic markdown bold support if model outputs it
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            }} 
                        />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-white flex justify-end">
                <button 
                    onClick={() => setShowResultModal(false)}
                    className="px-6 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 font-medium transition"
                >
                    Close
                </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const ToolBtn: React.FC<{
    icon: React.ReactNode;
    active?: boolean;
    onClick: () => void;
    label: string;
    color?: string;
}> = ({ icon, active, onClick, label, color }) => (
    <button
        onClick={onClick}
        title={label}
        className={`
            w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all
            ${active 
                ? 'bg-teal-600 text-white shadow-md scale-105' 
                : `text-slate-500 hover:bg-slate-100 ${color || ''}`}
        `}
    >
        {icon}
    </button>
);

export default App;
