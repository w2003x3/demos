/**
 * modal.js
 * Simple helper for blocking UI dialogs.
 */
import { store } from '../core/store.js';

export class Modal {
    static show(title, contentHtml, onConfirm, onCancel) {
        // Create Overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';

        modal.innerHTML = `
            <h3>${title}</h3>
            <div class="modal-content">${contentHtml}</div>
            <div class="modal-actions">
                <button class="modal-btn btn-secondary" id="modal-cancel">取消</button>
                <button class="modal-btn btn-primary" id="modal-confirm">確定</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Focus first input
        const input = modal.querySelector('input[type="text"]');
        if (input) input.focus();

        return new Promise((resolve) => {
            const close = (result, data) => {
                overlay.remove();
                resolve({ result, data });
            };

            const handleConfirm = () => {
                if (onConfirm) {
                    const data = onConfirm(modal);
                    if (data !== false) close(true, data);
                } else {
                    close(true);
                }
            };

            modal.querySelector('#modal-confirm').onclick = handleConfirm;

            modal.querySelector('#modal-cancel').onclick = () => {
                if (onCancel) onCancel();
                close(false);
            };

            // 支援 Enter 鍵直接確定、Escape 鍵取消
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    modal.querySelector('#modal-cancel').click();
                }
            });
        });
    }

    /**
     * 功能4: 新增路線對話框，預設名稱支援參數，且預設不同顏色
     */
    static async promptLineCreation(defaultName = '新路線', defaultColor = '#ff0000', defaultCode = '') {
        return this.show(
            '新增路線',
            `
            <div class="form-group">
                <label>路線名稱</label>
                <input type="text" id="line-name" value="${defaultName}" />
            </div>
            <div class="form-group">
                <label>路線代碼</label>
                <input type="text" id="line-code" value="${defaultCode}" placeholder="例如 R, BL, G 等" />
            </div>
            <div class="form-group">
                <label>代表色</label>
                <input type="color" id="line-color" value="${defaultColor}" style="height: 40px; cursor: pointer;" />
            </div>
            `,
            (modal) => {
                const name = modal.querySelector('#line-name').value;
                const code = modal.querySelector('#line-code').value;
                const color = modal.querySelector('#line-color').value;
                if (!name) return false;
                return { name, code, color };
            }
        );
    }

    /**
     * 功能2: 調整車站所屬路線（必選、複選）
     */
    static async promptStationLines(station) {
        const allLines = store.getLines();
        if (allLines.length === 0) {
            alert('目前沒有任何路線，請先新增路線。');
            return { result: false };
        }

        const checkboxesHtml = allLines.map(line => {
            const checked = station.lines.includes(line.id) ? 'checked' : '';
            return `
                <label class="checkbox-item">
                    <input type="checkbox" value="${line.id}" ${checked} />
                    <span class="color-swatch" style="background:${line.color}"></span>
                    <span>${line.name}</span>
                </label>
            `;
        }).join('');

        return this.show(
            `調整「${station.name}」所屬路線`,
            `
            <div class="checkbox-list">
                ${checkboxesHtml}
            </div>
            <p class="hint-text">⚠️ 至少需選擇一條路線</p>
            `,
            (modal) => {
                const checked = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked'));
                const lineIds = checked.map(cb => cb.value);
                if (lineIds.length === 0) {
                    alert('至少需選擇一條路線！');
                    return false;
                }
                return { lineIds };
            }
        );
    }

    /**
     * 功能3: 調整路線車站排序
     */
    static async promptLineStationOrder(line) {
        const stationNodes = line.nodes.filter(n => n.type === 'station');
        const stations = stationNodes.map(n => {
            const s = store.getStations().find(st => st.id === n.id);
            return s ? { id: s.id, name: s.name } : null;
        }).filter(Boolean);

        if (stations.length === 0) {
            alert('此路線尚無車站。');
            return { result: false };
        }

        const listHtml = stations.map((s, i) => `
            <div class="sortable-item" data-id="${s.id}">
                <span class="sort-index">${i + 1}</span>
                <span class="sort-name">${s.name}</span>
                <div class="sort-actions">
                    <button class="sort-btn sort-up" data-dir="up" ${i === 0 ? 'disabled' : ''}>▲</button>
                    <button class="sort-btn sort-down" data-dir="down" ${i === stations.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
            </div>
        `).join('');

        const result = await this.show(
            `調整「${line.name}」車站排序`,
            `<div class="sortable-list" id="sortable-list">${listHtml}</div>
             <p class="hint-text">⚠️ 重新排序後，路線上的轉折點將自動移除</p>`,
            (modal) => {
                const items = Array.from(modal.querySelectorAll('.sortable-item'));
                return { orderedIds: items.map(el => el.dataset.id) };
            }
        );

        // 在 show 之後綁定按鈕事件（需要在 DOM 加入後）
        // 由於 show 是同步建立 DOM 的，我們需要在 Promise 建立後立刻綁定
        // 實際上我們需要修改方式：在 show 之後取得 overlay
        // 但 show 回傳 Promise...
        // 替代方案：在 show 呼叫後，直接操作 DOM

        return result;
    }
}

// 全域綁定排序按鈕事件（使用事件委派）
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;

    const list = btn.closest('.sortable-list');
    if (!list) return;

    const item = btn.closest('.sortable-item');
    if (!item) return;

    const dir = btn.dataset.dir;
    if (dir === 'up' && item.previousElementSibling) {
        list.insertBefore(item, item.previousElementSibling);
    } else if (dir === 'down' && item.nextElementSibling) {
        list.insertBefore(item.nextElementSibling, item);
    }

    // 更新索引與按鈕狀態
    const items = Array.from(list.querySelectorAll('.sortable-item'));
    items.forEach((el, i) => {
        el.querySelector('.sort-index').textContent = i + 1;
        const upBtn = el.querySelector('.sort-up');
        const downBtn = el.querySelector('.sort-down');
        if (upBtn) upBtn.disabled = (i === 0);
        if (downBtn) downBtn.disabled = (i === items.length - 1);
    });
});
