<div class="flex h-screen">

  <!-- SIDEBAR -->
  <div class="w-52 bg-gray-900 text-white p-4 space-y-2 overflow-y-auto">

    <div class="text-sm font-bold mb-2 text-yellow-400">NODES</div>

    <div draggable="true" (dragstart)="onDragStart('log')" 
         class="p-2 bg-green-700 rounded cursor-move hover:bg-green-600 transition">
      📝 Log Node
    </div>

    <div draggable="true" (dragstart)="onDragStart('color')" 
         class="p-2 bg-purple-700 rounded cursor-move hover:bg-purple-600 transition">
      🎨 Color Node
    </div>

    <div draggable="true" (dragstart)="onDragStart('repeat')" 
         class="p-2 bg-blue-700 rounded cursor-move hover:bg-blue-600 transition">
      🔄 Repeat Node
    </div>

    <div class="border-t border-gray-700 pt-2 mt-2">
      <button (click)="save()" class="w-full bg-yellow-500 p-2 rounded hover:bg-yellow-600 transition">
        💾 Save
      </button>

      <button (click)="clearCanvas()" class="w-full bg-red-600 p-2 rounded mt-2 hover:bg-red-700 transition">
        🗑️ Clear All
      </button>
    </div>

    <!-- OUTPUT LOG -->
    <div class="mt-4 bg-gray-800 p-2 rounded">
      <div class="text-sm font-bold mb-2 flex justify-between items-center">
        <span>📋 Output Log ({{ output.length }})</span>
        <button (click)="output = []" 
                class="text-xs bg-red-500 px-2 py-0.5 rounded hover:bg-red-600">
          Clear
        </button>
      </div>
      
      <div class="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
        @for (item of output; track $index) {
          <div class="p-1.5 border-b border-gray-700 rounded bg-gray-750">
            <div>
              <span class="text-gray-500">Step {{ item.step }}</span>
              <span class="text-gray-500 text-xs ml-1">[{{ item.fromNode }}]</span>
            </div>
            <div [style.color]="item.color" class="font-bold">
              "{{ item.text }}"
            </div>
          </div>
        }
        
        @if (output.length === 0) {
          <div class="text-gray-500 text-xs text-center py-4">
            No output yet<br>
            <span class="text-gray-600">Run a workflow to see results</span>
          </div>
        }
      </div>
    </div>

  </div>

  <!-- CANVAS -->
  <div
    class="flex-1 relative overflow-hidden"
    (drop)="onDrop($event)"
    (dragover)="allowDrop($event)"
    (mousemove)="onMouseMove($event)"
    (mouseup)="cancelConnection()"
    style="
      background-color: #0f172a;
      background-image: linear-gradient(#1e293b 1px, transparent 1px),
                        linear-gradient(90deg, #1e293b 1px, transparent 1px);
      background-size: 20px 20px;
    "
  >

    <!-- SVG FOR CONNECTIONS -->
    <svg class="absolute w-full h-full pointer-events-none" style="z-index: 1;">

      @for (edge of edges; track $index) {
        <path
          [attr.d]="getCurve(edge.from, edge.to)"
          [attr.stroke]="isEdgeInActivePath(edge.from, edge.to) ? '#f59e0b' : '#94a3b8'"
          [attr.stroke-width]="isEdgeInActivePath(edge.from, edge.to) ? 3 : 2"
          fill="none"
        />
      }

      @if(connectingLine){
        <path
          [attr.d]="getPreviewCurve()"
          stroke="#ef4444"
          fill="none"
          stroke-width="2"
          stroke-dasharray="5,5"
        />
      }

    </svg>

    <!-- NODES -->
    @for (node of nodes; track node.id) {

      <div
        (mousedown)="startDragNode(node, $event)"
        class="absolute w-48 rounded-xl shadow-lg text-white"
        [style.left.px]="node.x"
        [style.top.px]="node.y"
        [style.z-index]="draggingNode?.id === node.id ? 50 : 10"
        [ngClass]="{
          'bg-green-700': node.type === 'log',
          'bg-purple-700': node.type === 'color',
          'bg-blue-700': node.type === 'repeat',
          'ring-2 ring-yellow-400': isNodeInActivePath(node.id)
        }"
      >

        <!-- HEADER -->
        <div class="px-3 py-2 font-semibold border-b border-white/20 flex justify-between items-center">
          <span>
            @if(node.type === 'log'){ 📝 Log }
            @if(node.type === 'color'){ 🎨 Color }
            @if(node.type === 'repeat'){ 🔄 Repeat }
          </span>
          <button (click)="deleteNode(node.id)" 
                  class="text-xs bg-red-500 px-1 rounded hover:bg-red-600">
            ✕
          </button>
        </div>

        <!-- BODY -->
        <div class="p-3">

          @if(node.type === 'log'){
            <label class="text-xs block mb-1">Text to print:</label>
            <input class="w-full p-1 rounded text-black text-sm"
                   [(ngModel)]="node.data.text"
                   placeholder="Enter text..." />
          }

          @if(node.type === 'color'){
            <label class="text-xs block mb-1">Text to print:</label>
            <input class="w-full p-1 rounded text-black text-sm mb-2"
                   [(ngModel)]="node.data.text"
                   placeholder="Enter text..." />
            <label class="text-xs block mb-1">Output color:</label>
            <input type="color" [(ngModel)]="node.data.color" class="w-full h-8 rounded" />
          }

          @if(node.type === 'repeat'){
            <label class="text-xs block mb-1">Repeat count:</label>
            <input type="number" 
                   class="w-full p-1 rounded text-black text-sm"
                   [(ngModel)]="node.data.repeatCount"
                   min="1"
                   max="10"
                   placeholder="3" />
          }

          <button class="mt-2 w-full bg-black/30 p-1 rounded hover:bg-black/50 text-sm"
                  (click)="runFromNode(node.id)">
            ▶ Run
          </button>

        </div>

        <!-- INPUT PORT (LEFT) -->
        <div
          class="port absolute left-[-6px] top-1/2 w-3 h-3 bg-white rounded-full cursor-pointer hover:bg-yellow-400 transition-colors"
          style="transform: translateY(-50%); z-index: 60;"
          (mouseup)="endConnection(node.id)"
          title="Input port"
        ></div>

        <!-- OUTPUT PORT (RIGHT) -->
        <div
          class="port absolute right-[-6px] top-1/2 w-3 h-3 bg-white rounded-full cursor-pointer hover:bg-yellow-400 transition-colors"
          style="transform: translateY(-50%); z-index: 60;"
          (mousedown)="startConnection(node.id, $event)"
          title="Output port"
        ></div>

      </div>

    }

    <!-- Empty state -->
    @if(nodes.length === 0){
      <div class="absolute inset-0 flex items-center justify-center text-gray-600 pointer-events-none">
        <div class="text-center">
          <div class="text-4xl mb-2">⚡</div>
          <div>Drag nodes from the sidebar</div>
        </div>
      </div>
    }

  </div>
</div>