// System Constants
const TICK_MS = 50; // 50ms per tick

class DummyTarget {
    constructor() {
        this.element = 'None';
        this.gauge = 0;
        this.totalDamageTaken = 0;
        this.lastAttachTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        this.lastReactionTime = { 'fw': -999, 'wf': -999, 'fi': -999, 'if': -999, 'wi': -999, 'iw': -999, 'shatter': -999 };
        this.updateVisuals();
    }

    reset() {
        this.element = 'None';
        this.gauge = 0;
        this.totalDamageTaken = 0;
        this.reactCount = 0;
        this.lastAttachTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        this.lastReactionTime = { 'fw': -999, 'wf': -999, 'fi': -999, 'if': -999, 'wi': -999, 'iw': -999, 'shatter': -999 };
        this.updateVisuals();
    }

    decay(dt, decayRate) {
        if (this.element !== 'None' && this.gauge > 0) {
            this.gauge -= decayRate * dt;
            if (this.gauge <= 0) {
                this.element = 'None';
                this.gauge = 0;
            }
            this.updateVisuals();
        }
    }

    applyHit(skillLabel, element, damage, attachAmount, time) {
        const maxGauge = parseFloat(document.getElementById('max-gauge').value) || 1000;
        const icd = parseFloat(document.getElementById('global-icd').value) || 0;
        
        // === 쇄빙 (Shatter): Frozen 상태 + Physical 타격 ===
        if (this.element === 'Frozen' && element === 'Physical') {
            const shatterCd = parseFloat(document.getElementById('react-shatter-cd').value) || 0;
            if (time >= this.lastReactionTime['shatter'] + shatterCd) {
                const shatterMult = parseFloat(document.getElementById('react-shatter-mult').value) || 1.0;
                const finalDamage = damage * shatterMult;
                // 쇄빙: 빙결 해제 및 게이지 전체 초기화
                this.element = 'None';
                this.gauge = 0;
                this.lastReactionTime['shatter'] = time;
                this.reactCount++;
                this.totalDamageTaken += finalDamage;
                this.updateVisuals();
                this.spawnDamageText(finalDamage, true, 'Physical');
                return { damage: finalDamage, isReaction: true, reactionMsg: `쇄빙(x${shatterMult})` };
            }
            // 쇄빙 쿨다운 중: 일반 물리피해
            this.totalDamageTaken += damage;
            this.updateVisuals();
            this.spawnDamageText(damage, false, 'Physical');
            return { damage, isReaction: false, reactionMsg: '' };
        }

        // ICD 판정 통과 여부
        let passesAttachIcd = false;
        if (element !== 'Physical' && attachAmount > 0) {
            if (time >= this.lastAttachTime[skillLabel] + icd) {
                passesAttachIcd = true;
            }
        }
        
        let actualAttach = passesAttachIcd ? attachAmount : 0;
        let finalDamage = damage;
        let isReaction = false;
        let reactionMsg = '';
        let isCritical = false;
        let commitAttachIcd = false;

        // === 반응 매트릭스: 속성이 다르고 부착량이 있을 때 ===
        if (actualAttach > 0 && this.element !== 'None' && this.element !== 'Frozen' && this.element !== element) {
            let mult = 1.0;
            let consumeRate = 1.0;
            let reactPrefix = '';
            let reactName = '';
            let isAmplify = false;
            let isFreeze = false;

            // 기화 (Vaporize): Fire ↔ Water
            if (this.element === 'Fire' && element === 'Water') {
                mult = parseFloat(document.getElementById('react-fw-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-fw-consume').value) || 1.0;
                reactPrefix = 'fw'; reactName = '기화'; isAmplify = true;
            } else if (this.element === 'Water' && element === 'Fire') {
                mult = parseFloat(document.getElementById('react-wf-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-wf-consume').value) || 1.0;
                reactPrefix = 'wf'; reactName = '기화'; isAmplify = true;
            }
            // 융해 (Melt): Fire ↔ Ice
            else if (this.element === 'Fire' && element === 'Ice') {
                mult = parseFloat(document.getElementById('react-fi-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-fi-consume').value) || 1.0;
                reactPrefix = 'fi'; reactName = '융해'; isAmplify = true;
            } else if (this.element === 'Ice' && element === 'Fire') {
                mult = parseFloat(document.getElementById('react-if-mult').value) || 1.0;
                consumeRate = parseFloat(document.getElementById('react-if-consume').value) || 1.0;
                reactPrefix = 'if'; reactName = '융해'; isAmplify = true;
            }
            // 빙결 (Freeze): Water ↔ Ice
            else if ((this.element === 'Water' && element === 'Ice') || (this.element === 'Ice' && element === 'Water')) {
                reactPrefix = (this.element === 'Water') ? 'wi' : 'iw';
                consumeRate = parseFloat(document.getElementById(`react-${reactPrefix}-consume`).value) || 0.5;
                reactName = '빙결'; isFreeze = true;
            }

            // 증폭 반응 (기화/융해)
            if (isAmplify && reactPrefix) {
                const reactCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                if (time >= this.lastReactionTime[reactPrefix] + reactCd) {
                    finalDamage *= mult;
                    isReaction = true;
                    isCritical = true;
                    reactionMsg = `${reactName}(x${mult})`;
                    this.reactCount++;
                    this.gauge -= (actualAttach * consumeRate);
                    if (this.gauge <= 0) { this.element = 'None'; this.gauge = 0; }
                    this.lastReactionTime[reactPrefix] = time;
                    commitAttachIcd = true;
                } else {
                    commitAttachIcd = false;
                }
            }
            // 빙결 반응
            else if (isFreeze) {
                const freezeCd = parseFloat(document.getElementById(`react-${reactPrefix}-cd`).value) || 0;
                if (time >= this.lastReactionTime[reactPrefix] + freezeCd) {
                    isReaction = true;
                    isCritical = true;
                    reactionMsg = '빙결!';
                    this.reactCount++;
                    this.gauge -= (actualAttach * consumeRate);
                    if (this.gauge <= 0) this.gauge = 0;
                    // Frozen 상태로 전환 (남은 게이지 유지)
                    this.element = 'Frozen';
                    if (this.gauge <= 0) this.gauge = actualAttach; // 최소 게이지 보장
                    this.lastReactionTime[reactPrefix] = time;
                    commitAttachIcd = true;
                } else {
                    commitAttachIcd = false;
                }
            }
        } else {
            // 반응 없음: 속성 중첩 또는 신규 부착
            if (actualAttach > 0) {
                if (this.element === 'None') {
                    const initMult = parseFloat(document.getElementById('initial-attach-mult').value) || 1.0;
                    this.element = element;
                    this.gauge = Math.min(maxGauge, actualAttach * initMult);
                    commitAttachIcd = true;
                } else if (this.element === element) {
                    this.gauge = Math.min(maxGauge, this.gauge + actualAttach);
                    commitAttachIcd = true;
                }
            }
        }

        if (commitAttachIcd) {
            this.lastAttachTime[skillLabel] = time;
        }

        this.totalDamageTaken += finalDamage;
        this.updateVisuals();
        this.spawnDamageText(finalDamage, isCritical, element);

        return { damage: finalDamage, isReaction, reactionMsg };
    }

    updateVisuals() {
        const dummy = document.getElementById('dummy-target');
        const badge = document.getElementById('current-element-badge');
        const fill = document.getElementById('attachment-gauge-fill');
        const text = document.getElementById('attachment-gauge-text');

        // Reset classes
        dummy.className = 'dummy-target';
        badge.className = 'element-badge';
        
        let elemName = '무속성';
        if (this.element === 'Fire') {
            dummy.classList.add('elem-fire');
            badge.classList.add('badge-fire');
            elemName = '🔥 Fire';
            fill.style.backgroundColor = 'var(--color-fire)';
        } else if (this.element === 'Water') {
            dummy.classList.add('elem-water');
            badge.classList.add('badge-water');
            elemName = '💧 Water';
            fill.style.backgroundColor = 'var(--color-water)';
        } else if (this.element === 'Ice') {
            dummy.classList.add('elem-ice');
            badge.classList.add('badge-ice');
            elemName = '❄️ Ice';
            fill.style.backgroundColor = 'var(--color-ice)';
        } else if (this.element === 'Frozen') {
            dummy.classList.add('elem-frozen');
            badge.classList.add('badge-frozen');
            elemName = '🧊 Frozen';
            fill.style.backgroundColor = 'var(--color-frozen)';
        } else {
            fill.style.backgroundColor = 'var(--color-none)';
        }

        badge.textContent = elemName;
        const maxGauge = parseFloat(document.getElementById('max-gauge').value) || 100;
        const pct = (this.gauge / maxGauge) * 100;
        fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        text.textContent = `${Math.floor(this.gauge)} / ${maxGauge}`;

        document.getElementById('stat-total-dmg').textContent = Math.floor(this.totalDamageTaken).toLocaleString();
        document.getElementById('stat-react-count').textContent = this.reactCount;
    }

    spawnDamageText(amount, isCritical, element) {
        const container = document.getElementById('damage-texts');
        const div = document.createElement('div');
        div.className = `dmg-popup ${isCritical ? 'critical' : ''}`;
        div.textContent = Math.floor(amount);
        
        // Randomize position slightly around center
        const x = 50 + (Math.random() * 40 - 20);
        const y = 50 + (Math.random() * 40 - 20);
        div.style.left = `${x}%`;
        div.style.top = `${y}%`;
        
        if (!isCritical) {
            if (element === 'Fire') div.style.color = '#fca5a5';
            else if (element === 'Water') div.style.color = '#93c5fd';
            else if (element === 'Ice') div.style.color = '#a5f3fc';
        }

        container.appendChild(div);
        setTimeout(() => div.remove(), 800);
    }
}

class SimulationEngine {
    constructor() {
        this.target = new DummyTarget();
        this.isRunning = false;
        this.timerId = null;
        this.currentTime = 0;
        this.maxTime = 10;
        this.hitQueue = [];
        this.activeChar = 'a';
        this.mode = 'setup'; // 'setup' | 'combat'
        this.lastCastTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
    }

    toggleMode() {
        const btn = document.getElementById('btn-toggle-mode');
        const ind = document.getElementById('mode-indicator');
        const setupView = document.getElementById('view-setup');
        const combatView = document.getElementById('view-combat');
        const loadBtn = document.getElementById('btn-load');

        if (this.mode === 'setup') {
            this.mode = 'combat';
            btn.textContent = '세팅 화면으로 돌아가기 ➔';
            ind.textContent = '현재 모드: Combat Mode';
            setupView.style.display = 'none';
            combatView.style.display = 'flex';
            if (loadBtn) loadBtn.style.display = 'none'; // 숨김
            this.syncHud();
            this.updateActiveUi();
        } else {
            this.stop(); // 전투 진행 중일 경우 정지 처리
            this.mode = 'setup';
            btn.textContent = '시뮬레이션 화면으로 ➔';
            ind.textContent = '현재 모드: Setup Mode';
            setupView.style.display = 'block';
            combatView.style.display = 'none';
            if (loadBtn) loadBtn.style.display = ''; // 복구
        }
    }

    getSkillDescStr(id) {
        const hits = document.getElementById(`skill-${id}-hits`).value;
        const dmg = document.getElementById(`skill-${id}-dmg`).value;
        const attach = document.getElementById(`skill-${id}-attach`).value;
        return (hits > 1) ? `${hits}x${dmg}dmg (${attach}A)` : `${dmg}dmg (${attach}A)`;
    }

    syncHud() {
        const charAElem = document.getElementById('char-a-element').value;
        const charBElem = document.getElementById('char-b-element').value;
        
        const elemIcon = (v) => v === 'Fire' ? '🔥' : v === 'Water' ? '💧' : '❄️';
        const tabBtnA = document.getElementById('tab-btn-a');
        const tabBtnB = document.getElementById('tab-btn-b');
        if (tabBtnA) tabBtnA.textContent = `Char A (${elemIcon(charAElem)})`;
        if (tabBtnB) tabBtnB.textContent = `Char B (${elemIcon(charBElem)})`;

        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const desc = document.getElementById(`hud-${id}-desc`);
            if (desc) desc.textContent = this.getSkillDescStr(id);
        });
    }

    updateActiveUi() {
        if (this.mode !== 'combat') return;

        const tabBtnA = document.getElementById('tab-btn-a');
        const tabBtnB = document.getElementById('tab-btn-b');
        const tabConA = document.getElementById('tab-content-a');
        const tabConB = document.getElementById('tab-content-b');
        
        if (tabBtnA) tabBtnA.classList.remove('active');
        if (tabBtnB) tabBtnB.classList.remove('active');
        if (tabConA) tabConA.style.display = 'none';
        if (tabConB) tabConB.style.display = 'none';

        if (this.activeChar === 'a') {
            if (tabBtnA) tabBtnA.classList.add('active');
            if (tabConA) { tabConA.style.display = 'block'; tabConA.classList.add('active'); }
        } else {
            if (tabBtnB) tabBtnB.classList.add('active');
            if (tabConB) { tabConB.style.display = 'block'; tabConB.classList.add('active'); }
        }
    }

    log(time, msg, type = 'system') {
        const container = document.getElementById('battle-log');
        if (!container) return;
        const div = document.createElement('div');
        div.className = `log-entry ${type}`;
        div.innerHTML = `[${time.toFixed(2)}s] ${msg}`;
        container.prepend(div);
    }

    start() {
        if (this.isRunning) return;
        
        this.maxTime = parseFloat(document.getElementById('sim-duration').value) || 10;
        this.target.reset();
        const logContainer = document.getElementById('battle-log');
        if (logContainer) logContainer.innerHTML = '';
        this.log(0, '전투 시뮬레이션 시작');
        
        this.currentTime = 0;
        this.hitQueue = [];
        this.lastCastTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        
        // 버튼 쿨다운 텍스트 원상복구
        this.syncHud();
        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const btn = document.getElementById(`btn-cast-${id}`);
            if (btn) btn.classList.remove('on-cd');
        });

        this.updateActiveUi();
        
        this.isRunning = true;
        this.tick();
        
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            btnStart.textContent = '⚔️ 전투 진행 중...';
            btnStart.classList.add('running');
        }
    }

    stop() {
        this.isRunning = false;
        if (this.timerId) clearTimeout(this.timerId);
        
        // Log final if max timer reached
        if (this.currentTime >= this.maxTime) {
            this.log(this.currentTime, `시뮬레이션 완료. 최종 피해: ${Math.floor(this.target.totalDamageTaken)}`);
        }
        
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            btnStart.textContent = '전투 시작 (Start)';
            btnStart.classList.remove('running');
        }
    }

    reset() {
        this.stop();
        this.target.reset();
        this.activeChar = 'a';
        this.currentTime = 0;
        this.lastCastTime = { 'a1': -999, 'a2': -999, 'b1': -999, 'b2': -999 };
        
        this.syncHud();
        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const btn = document.getElementById(`btn-cast-${id}`);
            if (btn) btn.classList.remove('on-cd');
        });

        this.updateActiveUi();
        const log = document.getElementById('battle-log');
        if (log) log.innerHTML = '<div class="log-entry system">시스템 준비 완료. 전투를 시작하세요.</div>';
    }

    tick() {
        if (!this.isRunning) return;

        const dt = TICK_MS / 1000;
        this.currentTime += dt;

        // 타겟 자연 감소
        const decayRate = parseFloat(document.getElementById('decay-rate').value) || 0;
        this.target.decay(dt, decayRate);

        // 큐에 예약된 다단히트 처리
        for (let i = this.hitQueue.length - 1; i >= 0; i--) {
            const hit = this.hitQueue[i];
            if (this.currentTime >= hit.timeTrigger) {
                const result = this.target.applyHit(hit.skillId, hit.element, hit.damage, hit.attach, this.currentTime);
                
                let logMsg = `Skill ${hit.label} 적중! 피해: <b>${Math.floor(result.damage)}</b>`;
                if (result.isReaction) {
                    logMsg += ` <span style="color:#fbbf24">[${result.reactionMsg}]</span>`;
                    this.log(this.currentTime, logMsg, 'reaction');
                } else {
                    this.log(this.currentTime, logMsg, 'hit');
                }
                
                this.hitQueue.splice(i, 1);
            }
        }

        this.updateCooldownUi();

        if (this.currentTime >= this.maxTime) {
            this.stop();
        } else {
            this.timerId = setTimeout(() => this.tick(), TICK_MS);
        }
    }

    updateCooldownUi() {
        if (!this.isRunning) return;
        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const btn = document.getElementById(`btn-cast-${id}`);
            const desc = document.getElementById(`hud-${id}-desc`);
            if (!btn || !desc) return;
            
            const cd = parseFloat(document.getElementById(`skill-${id}-cd`).value) || 0;
            const timeLeft = (this.lastCastTime[id] + cd) - this.currentTime;
            
            if (timeLeft > 0) {
                if (!btn.classList.contains('on-cd')) btn.classList.add('on-cd');
                desc.textContent = `⏳ ${timeLeft.toFixed(1)}s`;
            } else {
                if (btn.classList.contains('on-cd')) {
                    btn.classList.remove('on-cd');
                    desc.textContent = this.getSkillDescStr(id);
                }
            }
        });
    }

    castSkill(id, label) {
        if (!this.isRunning) return;

        const cd = parseFloat(document.getElementById(`skill-${id}-cd`).value) || 0;
        if (this.currentTime < this.lastCastTime[id] + cd) {
            // Cooldown block
            return;
        }

        this.lastCastTime[id] = this.currentTime;

        const charId = id.charAt(0); // 'a' or 'b'
        const attrType = document.getElementById(`skill-${id}-attr`).value;
        const element = (attrType === 'Physical') ? 'Physical' : document.getElementById(`char-${charId}-element`).value;
        
        const attach = parseFloat(document.getElementById(`skill-${id}-attach`).value) || 0;
        const hitDamage = parseFloat(document.getElementById(`skill-${id}-dmg`).value) || 0;
        const hitCount = parseInt(document.getElementById(`skill-${id}-hits`).value) || 1;
        const hitInterval = parseFloat(document.getElementById(`skill-${id}-interval`).value) || 0;
        
        // 다단히트 큐에 삽입
        for (let i = 0; i < hitCount; i++) {
            this.hitQueue.push({
                timeTrigger: this.currentTime + (i * hitInterval),
                skillId: id,
                label: label,
                element: element,
                damage: hitDamage,
                attach: attach
            });
        }
    }

    updateSkillSummaries() {
        if (this.mode !== 'setup') return;
        const icd = parseFloat(document.getElementById('global-icd').value) || 0;
        const initialMult = parseFloat(document.getElementById('initial-attach-mult').value) || 1.0;

        ['a1', 'a2', 'b1', 'b2'].forEach(id => {
            const hits = parseInt(document.getElementById(`skill-${id}-hits`).value) || 1;
            const dmg = parseFloat(document.getElementById(`skill-${id}-dmg`).value) || 0;
            const attach = parseFloat(document.getElementById(`skill-${id}-attach`).value) || 0;
            const interval = parseFloat(document.getElementById(`skill-${id}-interval`).value) || 0;
            
            const totalDmg = hits * dmg;
            
            // 예상 총 부착량 (실제 타격 타이밍을 시뮬레이션하여 ICD 적용)
            let totalAttach = 0;
            if (attach > 0) {
                let simLastAttach = -999;
                let isFirstAttach = true;
                for (let i = 0; i < hits; i++) {
                    const t = i * interval;
                    // 첫 타격이거나, 이전 부착 발동 후 ICD(부착 쿨)가 지났다면 부착 성공
                    if (simLastAttach === -999 || t >= simLastAttach + icd) {
                        if (isFirstAttach) {
                            totalAttach += attach * initialMult;
                            isFirstAttach = false;
                        } else {
                            totalAttach += attach;
                        }
                        simLastAttach = t;
                    }
                }
            }

            const cd = parseFloat(document.getElementById(`skill-${id}-cd`).value) || 0;
            const executionTime = hits * interval;
            const cycleTime = Math.max(1, cd, executionTime); // 콤보 시전 시간보다 쿨다운이 짧을 수 있으므로 대소비교 (최소 1초 보장)
            const dps = totalDmg / cycleTime;

            const sumDmgEl = document.getElementById(`summary-${id}-dmg`);
            const sumAttachEl = document.getElementById(`summary-${id}-attach`);
            const sumDpsEl = document.getElementById(`summary-${id}-dps`);
            
            if (sumDmgEl) sumDmgEl.textContent = Math.floor(totalDmg).toLocaleString();
            if (sumAttachEl) sumAttachEl.textContent = Math.floor(totalAttach).toLocaleString();
            if (sumDpsEl) sumDpsEl.textContent = Math.floor(dps).toLocaleString() + ' (쿨다운 기준)';
        });
    }
}

const engine = new SimulationEngine();

// UI Event Bindings
document.getElementById('btn-toggle-mode').addEventListener('click', () => engine.toggleMode());

const STORAGE_KEY = 'ag_combat_config';
let toastTimeout = null;
function showToast(msg) {
    const toast = document.getElementById('toast-msg');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

document.getElementById('btn-save').addEventListener('click', () => {
    const config = {};
    const inputs = document.querySelectorAll('#view-setup input, #view-setup select, .global-controls input');
    inputs.forEach(el => {
        if (el.id) {
            config[el.id] = el.value;
        }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    showToast("💾 데이터 설정이 캐시에 저장되었습니다!");
});

document.getElementById('btn-load').addEventListener('click', () => {
    if (engine.mode !== 'setup') return;
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
        showToast("❌ 앗, 캐시에 불러올 데이터가 없어요.");
        return;
    }
    try {
        const config = JSON.parse(data);
        for (const id in config) {
            const el = document.getElementById(id);
            if (el) {
                el.value = config[id];
                // 속성 옵션 이벤트 강제 트리거
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        engine.updateSkillSummaries();
        engine.syncHud();
        showToast("📂 캐시 로드 완료! 설정이 덮어씌워졌습니다.");
    } catch(e) {
        showToast("❌ 캐시 로드 중 에러가 발생했습니다.");
    }
});

// Setup 모드 내 인풋 변경 시 실시간 반영
document.getElementById('view-setup').addEventListener('input', () => {
    engine.updateSkillSummaries();
    engine.syncHud();
});
document.addEventListener('DOMContentLoaded', () => {
    engine.updateSkillSummaries();
    engine.syncHud();
});

document.getElementById('btn-start').addEventListener('click', () => {
    if (engine.isRunning) engine.stop();
    else engine.start();
});
document.getElementById('btn-reset').addEventListener('click', () => engine.reset());

// 탭 클릭 이벤트 추가
document.getElementById('tab-btn-a').addEventListener('click', () => { engine.activeChar = 'a'; engine.updateActiveUi(); });
document.getElementById('tab-btn-b').addEventListener('click', () => { engine.activeChar = 'b'; engine.updateActiveUi(); });

// 마우스 클릭 시 스킬 발동 (HUD)
document.getElementById('btn-cast-a1').addEventListener('click', () => { engine.activeChar = 'a'; engine.updateActiveUi(); engine.castSkill('a1', 'A-1'); });
document.getElementById('btn-cast-a2').addEventListener('click', () => { engine.activeChar = 'a'; engine.updateActiveUi(); engine.castSkill('a2', 'A-2'); });
document.getElementById('btn-cast-b1').addEventListener('click', () => { engine.activeChar = 'b'; engine.updateActiveUi(); engine.castSkill('b1', 'B-1'); });
document.getElementById('btn-cast-b2').addEventListener('click', () => { engine.activeChar = 'b'; engine.updateActiveUi(); engine.castSkill('b2', 'B-2'); });


// 키보드 입력 바인딩
window.addEventListener('keydown', (e) => {
    // 입력 모드가 아니거나, input 필드 내에서 타자 칠 때는 무시
    if (engine.mode !== 'combat') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    const key = e.key.toLowerCase();
    
    if (key === '1') {
        engine.activeChar = 'a';
        engine.updateActiveUi();
    } else if (key === '2') {
        engine.activeChar = 'b';
        engine.updateActiveUi();
    } else if (key === 'q') {
        const target = engine.activeChar === 'a' ? 'a1' : 'b1';
        const label = engine.activeChar === 'a' ? 'A-1' : 'B-1';
        engine.castSkill(target, label);
        
        const btn = document.getElementById(`btn-cast-${target}`);
        if (btn) {
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => btn.style.transform = 'none', 100);
        }
    } else if (key === 'e') {
        const target = engine.activeChar === 'a' ? 'a2' : 'b2';
        const label = engine.activeChar === 'a' ? 'A-2' : 'B-2';
        engine.castSkill(target, label);
        
        const btn = document.getElementById(`btn-cast-${target}`);
        if (btn) {
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => btn.style.transform = 'none', 100);
        }
    }
});

// Setup 모드 내 캐릭터 속성 토글 텍스트 업데이트 
document.getElementById('char-a-element').addEventListener('change', (e) => {
    const card = document.getElementById('char-a-card-setup');
    card.className = `character-card color-${e.target.value.toLowerCase()}-theme glass-panel`;
    const iconMap = { 'Fire': '🔥 화 (Fire)', 'Water': '💧 수 (Water)', 'Ice': '❄️ 빙 (Ice)' };
    const t = iconMap[e.target.value] || e.target.value;
    document.querySelector('#skill-a1-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
    document.querySelector('#skill-a2-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
});

document.getElementById('char-b-element').addEventListener('change', (e) => {
    const card = document.getElementById('char-b-card-setup');
    card.className = `character-card color-${e.target.value.toLowerCase()}-theme glass-panel`;
    const iconMap = { 'Fire': '🔥 화 (Fire)', 'Water': '💧 수 (Water)', 'Ice': '❄️ 빙 (Ice)' };
    const t = iconMap[e.target.value] || e.target.value;
    document.querySelector('#skill-b1-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
    document.querySelector('#skill-b2-attr option[value="elemental"]').textContent = `속성 피해 (${t})`;
});

// 반응 드롭다운 전환 이벤트
document.getElementById('reaction-selector').addEventListener('change', (e) => {
    document.querySelectorAll('.reaction-config').forEach(el => el.style.display = 'none');
    const selectedConfig = document.getElementById(`config-${e.target.value}`);
    if (selectedConfig) selectedConfig.style.display = 'block';
});
