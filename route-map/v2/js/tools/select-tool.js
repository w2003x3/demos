/**
 * select-tool.js
 * Tool for selecting items.
 * 功能6: 拖曳邏輯已移至 ToolManager，此處僅保留選取相關功能。
 */

export class SelectTool {
    constructor() {
        // wasDragged 由 ToolManager 管理
    }

    activate() {
        document.getElementById('map').style.cursor = 'default';
    }

    deactivate() {
        // nothing
    }

    onStationClick(e) {
        // Handle selection toggle if needed
    }

    onClick(e) {
        // Map Click - Clear selection
        import('../core/store.js').then(m => m.store.clearStationSelection());
    }
}
