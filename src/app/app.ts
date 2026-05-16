import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from './shared/environments/environment';

interface FlowNode {
  id: string;
  type: 'log' | 'color' | 'repeat' | 'counter' | 'delay' | 'alert' | 'random' | 'timer' | 'image';
  name: string;
  x: number;
  y: number;
  data: {
    text?: string;
    color?: string;
    repeatCount?: number;
    start?: number;
    end?: number;
    step?: number;
    milliseconds?: number;
    min?: number;
    max?: number;
    seconds?: number;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    showImage?: boolean;
  };
}

interface Edge {
  from: string;
  to: string;
}

interface OutputItem {
  text: string;
  color: string;
  step: number;
  fromNode: string;
  timestamp: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {

  nodes: FlowNode[] = [];
  edges: Edge[] = [];
  output: OutputItem[] = [];
  displayImage: { url: string; show: boolean } = { url: '', show: false };

  draggedNodeType: string | null = null;
  draggingNode: FlowNode | null = null;
  offsetX = 0;
  offsetY = 0;
  connectingFrom: string | null = null;
  connectingLine: any = null;

  activePathNodes: Set<string> = new Set<string>();
  activePathEdges: Set<string> = new Set<string>();

  private stepCounter = 0;
  isRunning = false;

  // ==================== CHATBOT ====================
  chatMessages: ChatMessage[] = [];
  chatInput: string = '';
  isChatLoading: boolean = false;
  private chatHistory: { role: string; content: string }[] = [];

  private readonly OPENROUTER_API_KEY = environment.openRouterApiKey;
  private readonly OPENROUTER_API_URL = environment.openRouterApiUrl;
  private readonly OPENROUTER_MODEL = environment.openRouterModel;

  defaultImages = [
    'https://i.imgur.com/6VBx3io.png',
    'https://i.imgur.com/3o6KlBm.jpeg',
    'https://i.imgur.com/KTmGQRr.jpeg'
  ];

  ngOnInit() {
    const data = localStorage.getItem('flow-project-v4');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.nodes = parsed.nodes || [];
        this.edges = parsed.edges || [];
      } catch (e) {
        console.log('No saved data');
      }
    }

    this.chatMessages.push({
      role: 'assistant',
      content: `مرحباً! أنا FlowForge Agent 👋\n\nيمكنني مساعدتك في:\n• تشغيل workflow بالاسم (مثل: "شغّل الـ log workflow")\n• إضافة nodes جديدة\n• شرح ما على الكانفاس\n• التحكم في الأتمتة بالكامل\n\nماذا تريد أن تفعل؟`
    });
  }

  // ==================== DRAG & DROP ====================

  onDragStart(type: string) {
    this.draggedNodeType = type;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const canvas = target.closest('.canvas-container') as HTMLElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    let defaultData: any = {};
    switch (this.draggedNodeType) {
      case 'log': defaultData = { text: '', color: '#fdba74' }; break;
      case 'color': defaultData = { color: '#ff6600', text: '' }; break;
      case 'repeat': defaultData = { repeatCount: 3 }; break;
      case 'counter': defaultData = { start: 1, end: 5, step: 1 }; break;
      case 'delay': defaultData = { milliseconds: 1000 }; break;
      case 'alert': defaultData = { text: '' }; break;
      case 'random': defaultData = { min: 1, max: 100 }; break;
      case 'timer': defaultData = { seconds: 5 }; break;
      case 'image': defaultData = { imageUrl: this.defaultImages[Math.floor(Math.random() * this.defaultImages.length)], imageWidth: 200, imageHeight: 200, showImage: false }; break;
      default: defaultData = { text: '', color: '#fdba74' }; break;
    }

    this.nodes.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type: this.draggedNodeType as any,
      name: '',
      x: event.clientX - rect.left - 110,
      y: event.clientY - rect.top - 40,
      data: defaultData
    });
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
  }

  startDragNode(node: FlowNode, event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('port')) return;
    this.draggingNode = node;
    this.offsetX = event.clientX - node.x;
    this.offsetY = event.clientY - node.y;
  }

  onMouseMove(event: MouseEvent) {
    if (this.draggingNode) {
      this.draggingNode.x = event.clientX - this.offsetX;
      this.draggingNode.y = event.clientY - this.offsetY;
      return;
    }
    if (!this.connectingFrom || !this.connectingLine) return;
    this.connectingLine.x2 = event.clientX;
    this.connectingLine.y2 = event.clientY;
  }

  cancelConnection() {
    this.draggingNode = null;
    this.finishConnection();
  }

  startConnection(nodeId: string, event: MouseEvent) {
    event.stopPropagation();
    this.connectingFrom = nodeId;
    const from = this.getNodeCenterRight(nodeId);
    this.connectingLine = { x1: from.x, y1: from.y, x2: from.x, y2: from.y };
  }

  endConnection(nodeId: string) {
    if (!this.connectingFrom) return;
    if (this.connectingFrom === nodeId) return;
    const exists = this.edges.some(e => e.from === this.connectingFrom && e.to === nodeId);
    if (!exists) {
      this.edges.push({ from: this.connectingFrom!, to: nodeId });
    }
    this.finishConnection();
  }

  finishConnection() {
    this.connectingFrom = null;
    setTimeout(() => this.connectingLine = null, 0);
  }

  getCurve(fromId: string, toId: string) {
    const from = this.getNodeCenterRight(fromId);
    const to = this.getNodeCenterLeft(toId);
    if (!from || !to) return '';
    const dx = Math.abs(to.x - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
  }

  getPreviewCurve() {
    if (!this.connectingLine) return '';
    const { x1, y1, x2, y2 } = this.connectingLine;
    const dx = Math.abs(x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  getNodeCenterRight(id: string) {
    const n = this.nodes.find(node => node.id === id);
    if (!n) return { x: 0, y: 0 };
    return { x: n.x + 220, y: n.y + 80 };
  }

  getNodeCenterLeft(id: string) {
    const n = this.nodes.find(node => node.id === id);
    if (!n) return { x: 0, y: 0 };
    return { x: n.x, y: n.y + 80 };
  }

  // ==================== RUN ENGINE ====================

  runFromNode(startId: string) {
    this.output = [];
    this.stepCounter = 0;
    this.isRunning = true;
    this.displayImage.show = false;

    const visitedNodes: string[] = [];
    this.executeAsync(startId, visitedNodes).finally(() => {
      this.highlightActivePath(visitedNodes);
      this.isRunning = false;
    });
  }

  private async executeAsync(nodeId: string, visitedNodes: string[]): Promise<void> {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    visitedNodes.push(nodeId);

    switch (node.type) {
      case 'log':
        const nextNodeId = this.getNextNodeId(nodeId);
        const nextColorNode = nextNodeId
          ? this.nodes.find(n => n.id === nextNodeId && n.type === 'color')
          : null;

        const logColor = nextColorNode
          ? (nextColorNode.data.color || '#ff6600')
          : (node.data.color || '#fdba74');

        this.addOutput(node.data.text || node.name || '', node.data.color || '#fdba74', 'log');
        break;

      case 'color':
        this.addOutput(node.data.text || '', node.data.color || '#ff6600', 'color');
        break;

      case 'repeat':
        const count = node.data.repeatCount || 1;
        const nextId = this.getNextNodeId(nodeId);
        if (!nextId) return;
        const nextNode = this.nodes.find(n => n.id === nextId);
        if (!nextNode) return;
        for (let i = 0; i < count; i++) {
          this.executeNode(nextNode, visitedNodes);
        }
        const afterRepeat = this.getNextNodeId(nextId);
        if (afterRepeat) {
          await this.executeAsync(afterRepeat, visitedNodes);
        }
        return;

      case 'counter':
        const start = node.data.start || 1;
        const end = node.data.end || 5;
        const step = node.data.step || 1;
        for (let i = start; i <= end; i += step) {
          this.addOutput(i.toString(), '#fb923c', 'counter');
        }
        break;

      case 'delay':
        const ms = node.data.milliseconds || 1000;
        this.addOutput(`⏱️ Waiting ${ms}ms...`, '#fbbf24', 'delay');
        await new Promise(resolve => setTimeout(resolve, ms));
        break;

      case 'alert':
        const alertText = node.data.text || 'Alert!';
        alert(alertText);
        this.addOutput(`🔔 Alert: "${alertText}"`, '#f43f5e', 'alert');
        break;

      case 'random':
        const min = node.data.min || 1;
        const max = node.data.max || 100;
        const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
        this.addOutput(`🎲 Random: ${randomNum}`, '#e879f9', 'random');
        break;

      case 'timer':
        const seconds = node.data.seconds || 5;
        this.addOutput(`⏰ Timer: ${seconds}s`, '#fdba74', 'timer');
        for (let i = seconds; i > 0; i--) {
          this.addOutput(`⏳ ${i}...`, '#fdba74', 'timer');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.addOutput(`⏰ Time's up! 🔔`, '#f43f5e', 'timer');
        break;

      case 'image':
        const imageUrl = node.data.imageUrl || this.defaultImages[0];
        this.displayImage = { url: imageUrl, show: true };
        this.addOutput(`🖼️ Displaying image!`, '#ec4899', 'image');
        setTimeout(() => { this.displayImage.show = false; }, 5);
        break;
    }

    const next = this.getNextNodeId(nodeId);
    if (next) {
      await this.executeAsync(next, visitedNodes);
    }
  }

  private executeNode(node: FlowNode, visitedNodes: string[]): void {
    visitedNodes.push(node.id);
    switch (node.type) {
      case 'log':
        this.addOutput(node.data.text || node.name || '', node.data.color || '#fdba74', 'log');
        break;
      case 'color': this.addOutput(node.data.text || node.name || '', node.data.color || '#ff6600', 'color'); break;
      case 'counter':
        const s = node.data.start || 1, e = node.data.end || 5, st = node.data.step || 1;
        for (let i = s; i <= e; i += st) this.addOutput(i.toString(), '#fb923c', 'counter');
        break;
      case 'random':
        const mn = node.data.min || 1, mx = node.data.max || 100;
        this.addOutput(`🎲 ${Math.floor(Math.random() * (mx - mn + 1)) + mn}`, '#e879f9', 'random');
        break;
    }
  }

  private addOutput(text: string, color: string, fromNode: string) {
    this.stepCounter++;
    this.output.push({ text, color, step: this.stepCounter, fromNode, timestamp: Date.now() });
  }

  private getNextNodeId(currentNodeId: string): string | null {
    const edge = this.edges.find(e => e.from === currentNodeId);
    return edge ? edge.to : null;
  }

  closeImage() { this.displayImage.show = false; }

  // ==================== FAST LOCAL KEYWORD DETECTION ====================
  // Intercepts common commands BEFORE calling the API to respond instantly

  private tryHandleLocally(msg: string): string | null {
    const lower = msg.toLowerCase().trim();

    // RUN command detection
    const runPatterns = [
      /(?:شغّل|شغل|run|تشغيل)\s+(?:الـ|ال|workflow\s+)?(.+)/i,
      /(?:ابدأ|start)\s+(.+)/i
    ];
    for (const pattern of runPatterns) {
      const match = lower.match(pattern);
      if (match) {
        const name = match[1].replace(/workflow|الـ|ال/gi, '').trim();
        const node = this.nodes.find(n =>
          n.name && n.name.toLowerCase().includes(name)
        ) || this.nodes.find(n => n.type === name);

        if (node) {
          setTimeout(() => this.runFromNode(node.id), 100);
          return `✅ جارٍ تشغيل "${node.name || node.type}"...`;
        }
        if (this.nodes.length === 0) {
          return `❌ الكانفاس فارغ! أضف nodes أولاً 👇`;
        }
        return null; // Let API handle it
      }
    }

    // CLEAR command detection
    if (/^(امسح|احذف|clear|مسح)\s*(الكانفاس|canvas|كل شيء|كلشي)?$/i.test(lower)) {
      this.clearCanvas(true);
      return `✅ تم مسح الكانفاس.`;
    }

    // CANVAS STATUS
    if (/^(ما|what|كم|how many|اعرض|show).*(nodes?|نود|الكانفاس|canvas)/i.test(lower)) {
      const summary = this.getWorkflowSummary();
      return `📊 ${summary}`;
    }

    return null; // Not handled locally — send to API
  }

  // ==================== CHATBOT AGENT ====================

  getWorkflowSummary(): string {
    if (this.nodes.length === 0) return 'الكانفاس فارغ. لا يوجد nodes أو workflows.';
    const named = this.nodes.filter(n => n.name).map(n => `"${n.name}" (${n.type})`);
    const unnamed = this.nodes.filter(n => !n.name).map(n => n.type);
    let s = `الكانفاس يحتوي على ${this.nodes.length} node و ${this.edges.length} اتصال. `;
    if (named.length) s += `Workflows مسماة: ${named.join(', ')}. `;
    if (unnamed.length) s += `أنواع nodes غير مسماة: ${unnamed.join(', ')}. `;
    this.edges.forEach(e => {
      const fn = this.nodes.find(x => x.id === e.from);
      const tn = this.nodes.find(x => x.id === e.to);
      if (fn && tn) s += `"${fn.name || fn.type}" → "${tn.name || tn.type}". `;
    });
    return s;
  }

  async sendChatMessage() {
    const msg = this.chatInput.trim();
    if (!msg || this.isChatLoading) return;

    this.chatInput = '';
    this.chatMessages.push({ role: 'user', content: msg });

    // ✅ SPEED BOOST #1: Try to handle locally first (instant response)
    const localReply = this.tryHandleLocally(msg);
    if (localReply) {
      this.chatMessages.push({ role: 'assistant', content: localReply });
      this.chatHistory.push(
        { role: 'user', content: msg },
        { role: 'assistant', content: localReply }
      );
      return;
    }

    // Fall back to API for complex/conversational requests
    const typingMsg: ChatMessage = { role: 'assistant', content: '...', isTyping: true };
    this.chatMessages.push(typingMsg);
    this.isChatLoading = true;

    // ✅ SPEED BOOST #2: Shorter, tighter system prompt
    const systemInstruction = `أنت FlowForge Agent - ذكاء اصطناعي يتحكم في كانفاس أتمتة.

حالة الكانفاس: ${this.getWorkflowSummary()}

أنواع الـ nodes: log, color, repeat, counter, delay, timer, alert, random, image

قواعد الإجراءات:
- تشغيل workflow → [ACTION:run-by-name:الاسم]
- إضافة node → [ACTION:add:النوع:100:100:الاسم]
- حذف node → [ACTION:delete:الاسم]
- مسح الكانفاس → [ACTION:clear]

أمثلة:
"شغل my log" → "حسناً! [ACTION:run-by-name:my log]"
"أضف log اسمه test" → "تمت! [ACTION:add:log:150:150:test]"

- رد دائماً بنفس لغة المستخدم (عربي أو إنجليزي).
- اذكر ACTION دائماً عند الحاجة لإجراء.
- كن مختصراً وواضحاً.`;

    try {
      const response = await fetch(
        this.OPENROUTER_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.OPENROUTER_API_KEY}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'FlowForge Agent'
          },
          body: JSON.stringify({
            // ✅ SPEED BOOST #3: DeepSeek through OpenRouter
            model: this.OPENROUTER_MODEL,
            // ✅ SPEED BOOST #4: Fewer max tokens = faster response
            max_tokens: 350,
            messages: [
              { role: 'system', content: systemInstruction },
              // ✅ SPEED BOOST #5: Only send last 6 history messages
              ...this.chatHistory.slice(-6),
              { role: 'user', content: msg }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API Request Failed');
      }

      const data = await response.json();
      let reply = data?.choices?.[0]?.message?.content || 'لم أتمكن من الحصول على رد.';

      this.chatHistory.push(
        { role: 'user', content: msg },
        { role: 'assistant', content: reply }
      );

      // Keep chat history from growing too large
      if (this.chatHistory.length > 20) {
        this.chatHistory = this.chatHistory.slice(-20);
      }

      const finalReply = this.processAgentActions(reply);
      const idx = this.chatMessages.indexOf(typingMsg);
      if (idx !== -1) {
        this.chatMessages[idx] = { role: 'assistant', content: finalReply };
      }

    } catch (error: any) {
      console.error('OpenRouter Error:', error);
      const idx = this.chatMessages.indexOf(typingMsg);
      if (idx !== -1) {
        this.chatMessages[idx] = {
          role: 'assistant',
          content: `❌ خطأ: ${error.message}`
        };
      }
    } finally {
      this.isChatLoading = false;
      setTimeout(() => {
        const el = document.getElementById('chatMessages');
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }

  processAgentActions(reply: string): string {
    let clean = reply;
    clean = clean.replace(/\[ACTION:run-by-name:([^\]]+)\]/g, (_, name) => {
      const node = this.nodes.find(n => n.name && n.name.toLowerCase() === name.toLowerCase().trim());
      if (node) {
        setTimeout(() => this.runFromNode(node.id), 300);
        let preview = '';
        if (node.type === 'log') preview = `\n📝 النص: "${node.data.text || '(فارغ)'}" باللون ${node.data.color || '#fdba74'}`;
        if (node.type === 'color') preview = `\n🎨 النص: "${node.data.text || '(فارغ)'}" باللون ${node.data.color}`;
        if (node.type === 'counter') preview = `\n🔢 من ${node.data.start} إلى ${node.data.end} بخطوة ${node.data.step}`;
        if (node.type === 'random') preview = `\n🎲 رقم عشوائي بين ${node.data.min} و ${node.data.max}`;
        if (node.type === 'timer') preview = `\n⏰ مؤقت ${node.data.seconds} ثانية`;
        if (node.type === 'delay') preview = `\n⏱️ انتظار ${node.data.milliseconds}ms`;
        return `✅ جارٍ تشغيل "${name}"...${preview}`;
      }
      const byType = this.nodes.find(n => n.type === name.toLowerCase().trim());
      if (byType) {
        setTimeout(() => this.runFromNode(byType.id), 300);
        return `✅ جارٍ تشغيل نود ${name}...`;
      }
      return `❌ لم يُوجد workflow باسم "${name}". الكانفاس ${this.nodes.length === 0 ? 'فارغ! أضف nodes أولاً 👇' : 'يحتوي على: ' + this.nodes.map(n => n.name || n.type).join(', ')}`;
    });

    clean = clean.replace(/\[ACTION:run:([^\]]+)\]/g, (_, id) => {
      const node = this.nodes.find(n => n.id === id);
      if (node) { setTimeout(() => this.runFromNode(id), 300); return ''; }
      return '';
    });

    clean = clean.replace(/\[ACTION:add:([^:]+):(\d+):(\d+):?([^\]]*)\]/g, (_, type, x, y, name) => {
      const t = type.toLowerCase().trim() as FlowNode['type'];
      const validTypes: FlowNode['type'][] = ['log', 'color', 'repeat', 'counter', 'delay', 'timer', 'alert', 'random', 'image'];
      if (validTypes.includes(t)) {
        this.addNodeFromAgent(t, parseInt(x) || 100, parseInt(y) || 100, name || '');
        return `✅ تمت إضافة نود "${t}"${name ? ` باسم "${name}"` : ''}.`;
      }
      return `❌ نوع نود غير معروف: ${type}`;
    });

    clean = clean.replace(/\[ACTION:delete:([^\]]+)\]/g, (_, name) => {
      const node = this.nodes.find(n => n.name && n.name.toLowerCase() === name.toLowerCase().trim());
      if (node) {
        this.deleteNode(node.id);
        return `✅ تم حذف "${name}".`;
      }
      return `❌ لم يُوجد workflow باسم "${name}".`;
    });

    clean = clean.replace(/\[ACTION:clear\]/g, () => {
      this.clearCanvas(true);
      return '✅ تم مسح الكانفاس.';
    });

    return clean.trim();
  }

  addNodeFromAgent(type: FlowNode['type'], x: number, y: number, name: string) {
    const defaults: any = {
      log: { text: '', color: '#fdba74' },
      color: { color: '#ff6600', text: '' },
      repeat: { repeatCount: 3 },
      counter: { start: 1, end: 5, step: 1 },
      delay: { milliseconds: 1000 },
      timer: { seconds: 5 },
      alert: { text: '' },
      random: { min: 1, max: 100 },
      image: { imageUrl: this.defaultImages[0] }
    };
    this.nodes.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type, name, x, y, data: { ...defaults[type] }
    });
  }

  onChatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendChatMessage();
    }
  }

  sendHint(text: string) {
    this.chatInput = text;
    this.sendChatMessage();
  }

  // ==================== HIGHLIGHT ====================

  highlightActivePath(pathNodes: string[]) {
    this.activePathNodes = new Set(pathNodes);
    this.activePathEdges = new Set();
    for (let i = 0; i < pathNodes.length - 1; i++) {
      this.activePathEdges.add(pathNodes[i] + '-' + pathNodes[i + 1]);
    }
    setTimeout(() => {
      this.activePathNodes.clear();
      this.activePathEdges.clear();
    }, 4000);
  }

  isNodeInActivePath(nodeId: string): boolean { return this.activePathNodes.has(nodeId); }
  isEdgeInActivePath(fromId: string, toId: string): boolean { return this.activePathEdges.has(fromId + '-' + toId); }

  // ==================== NODE HELPERS ====================

  getNodeTypeClass(type: string): string {
    const classes: any = { log: 'node-log-card', color: 'node-color-card', repeat: 'node-repeat-card', counter: 'node-counter-card', delay: 'node-delay-card', alert: 'node-alert-card', random: 'node-random-card', timer: 'node-timer-card', image: 'node-image-card' };
    return classes[type] || '';
  }

  getNodeHeaderClass(type: string): string {
    const classes: any = { log: 'node-header-log', color: 'node-header-color', repeat: 'node-header-repeat', counter: 'node-header-counter', delay: 'node-header-delay', alert: 'node-header-alert', random: 'node-header-random', timer: 'node-header-timer', image: 'node-header-image' };
    return classes[type] || '';
  }

  getNodeIcon(type: string): string {
    const icons: any = { log: '📝', color: '🎨', repeat: '🔄', counter: '🔢', delay: '⏱️', alert: '🔔', random: '🎲', timer: '⏰', image: '🖼️' };
    return icons[type] || '📦';
  }

  // ==================== UTILS ====================

  deleteNode(nodeId: string) {
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.edges = this.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  }

  clearCanvas(skipConfirm = false) {
    if (!skipConfirm && !confirm('Clear all nodes and connections?')) return;
    this.nodes = [];
    this.edges = [];
    this.output = [];
    this.displayImage = { url: '', show: false };
    localStorage.removeItem('flow-project-v4');
  }

  save() {
    localStorage.setItem('flow-project-v4', JSON.stringify({ nodes: this.nodes, edges: this.edges }));
    this.addOutput('💾 Project saved!', '#34d399', 'system');
  }

  exportProject() {
    const data = JSON.stringify({ nodes: this.nodes, edges: this.edges }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flowforge-v4-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  importProject(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        this.nodes = data.nodes || [];
        this.edges = data.edges || [];
        this.save();
        this.addOutput('📂 Project imported!', '#34d399', 'system');
      } catch (err) {
        alert('Invalid file format');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // ==================== IMAGE UPLOAD ====================

  uploadedImages: Map<string, string> = new Map();

  triggerImageUpload(nodeId: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) this.handleImageFile(file, nodeId);
    };
    input.click();
  }

  handleImageFile(file: File, nodeId: string) {
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Image size must be less than 10MB'); return; }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const imageData = e.target.result as string;
      this.uploadedImages.set(nodeId, imageData);
      const node = this.nodes.find(n => n.id === nodeId);
      if (node) node.data.imageUrl = imageData;
      this.addOutput('📷 Image uploaded!', '#34d399', 'system');
    };
    reader.readAsDataURL(file);
  }

  clearImage(nodeId: string) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) { node.data.imageUrl = ''; this.uploadedImages.delete(nodeId); }
  }
}
