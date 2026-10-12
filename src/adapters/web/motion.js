export function mountMotion() {
  'use strict';
  // 数据同步提交，动画负责布局和视口的连续变化。
  if (!Element.prototype.animate) return { navigate: update => update(), position: target => target.scrollIntoView({block: "nearest"}) };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const printing = window.matchMedia('print');
  const root = document.documentElement;
  const $ = id => document.getElementById(id);
  const settings = $('settings');
  const steps = [...settings.querySelectorAll('.step')];
  const calendar = $('calendar-container');
  const canvas = document.querySelector('.canvas');
  const running = new Set();
  const byElement = new WeakMap();
  const allowed = () => !reduce.matches && !printing.matches && !document.hidden;
  const ease = 'cubic-bezier(.22,1,.36,1)';
  const duration = root.dataset.theme === 'mist' ? 280 : 340;
  let navigation = null;
  let pendingPosition = null;

  function restoreNavigation() {
    if (!navigation) return;
    cancelAnimationFrame(navigation.frame);
    for (const item of navigation.boxes) {
      item.element.style.height = item.height;
      item.element.style.overflow = item.overflow;
    }
    calendar.style.transform = navigation.calendarTransform;
    document.body.style.minHeight = navigation.minHeight;
    root.classList.remove('navigation-motion');
    navigation = null;
  }
  // 切换步骤前固定容器几何尺寸，使页面高度和滚动位置沿同一时间线变化。
  function navigate(update) {
    const boxes = [document.querySelector('.preview-heading'),canvas,settings].map(element => ({element,start:element.hidden ? 0 : element.getBoundingClientRect().height}));
    const calendarStart = calendar.getBoundingClientRect().top-canvas.getBoundingClientRect().top;
    const startY = window.scrollY;
    const documentHeight = Math.max(root.scrollHeight,window.innerHeight);
    restoreNavigation();
    const state = {
      boxes:boxes.map(item => ({...item,height:item.element.style.height,overflow:item.element.style.overflow})),
      minHeight:document.body.style.minHeight, calendarTransform:calendar.style.transform, frame:0, target:null
    };
    navigation = state;
    root.classList.add('navigation-motion');
    document.body.style.minHeight = documentHeight+'px';
    for (const item of state.boxes) {
      item.element.style.height = item.start+'px';
      item.element.style.overflow = 'hidden';
    }
    window.scrollTo({top:startY,behavior:'auto'});
    pendingPosition = state;
    try { update(); }
    catch (error) { restoreNavigation(); throw error; }
    finally { pendingPosition = null; }

    // 同步测量目标布局，并在绘制前恢复过渡起点。
    for (const item of state.boxes) item.element.style.height = item.height;
    document.body.style.minHeight = state.minHeight;
    for (const item of state.boxes) item.end = item.element.hidden ? 0 : item.element.getBoundingClientRect().height;
    const calendarDelta = calendarStart-(calendar.getBoundingClientRect().top-canvas.getBoundingClientRect().top);
    const maxY = Math.max(0,root.scrollHeight-window.innerHeight);
    const targetRect = state.target?.getBoundingClientRect();
    const targetTop = targetRect ? targetRect.top+window.scrollY : startY;
    let endY = Math.min(startY,maxY);
    // 日历入口已经可见时保持视口位置。
    if (targetRect && (targetTop-startY < 20 || targetTop+targetRect.height-startY > window.innerHeight-20)) {
      endY = Math.max(0,Math.min(targetTop-24,maxY));
    }
    const unchanged = state.boxes.every(item => Math.abs(item.end-item.start)<.5) && Math.abs(endY-startY)<1 && Math.abs(calendarDelta)<.5;
    if (!allowed() || unchanged) { restoreNavigation(); window.scrollTo({top:endY,behavior:'auto'}); return; }
    document.body.style.minHeight = Math.max(documentHeight,root.scrollHeight)+'px';
    for (const item of state.boxes) item.element.style.height = item.start+'px';
    if (Math.abs(calendarDelta)>.5) calendar.style.transform = `translateY(${calendarDelta}px)`;
    window.scrollTo({top:startY,behavior:'auto'});
    const began = performance.now();
    const milliseconds = root.dataset.theme === 'mist' ? 360 : 400;
    const tick = now => {
      if (navigation !== state) return;
      const progress = Math.min(1,(now-began)/milliseconds);
      const eased = progress*progress*(3-2*progress);
      for (const item of state.boxes) {
        if (!item.element.hidden) item.element.style.height = (item.start+(item.end-item.start)*eased)+'px';
      }
      if (Math.abs(calendarDelta)>.5) calendar.style.transform = `translateY(${calendarDelta*(1-eased)}px)`;
      window.scrollTo({top:startY+(endY-startY)*eased,behavior:'auto'});
      if (progress < 1) state.frame = requestAnimationFrame(tick);
      else { restoreNavigation(); window.scrollTo({top:endY,behavior:'auto'}); }
    };
    state.frame = requestAnimationFrame(tick);
  }
  function position(target) {
    if (pendingPosition) pendingPosition.target = target;
    else navigate(() => { pendingPosition.target = target; });
  }
  // 手动滚动优先；连续导航从当前帧开始。
  window.addEventListener('wheel',restoreNavigation,{passive:true});
  window.addEventListener('touchstart',restoreNavigation,{passive:true});
  window.addEventListener('resize',restoreNavigation,{passive:true});
  document.addEventListener('keydown',event => {
    if (['PageUp','PageDown','Home','End','ArrowUp','ArrowDown','Escape','Tab'].includes(event.key)) restoreNavigation();
  });

  function play(element, frames, milliseconds = duration, delay = 0, cleanup) {
    if (!element || !allowed() || !element.getClientRects().length) { cleanup?.(); return; }
    byElement.get(element)?.cancel();
    const animation = element.animate(frames, {duration:milliseconds, delay, easing:ease, fill:'backwards'});
    byElement.set(element, animation);
    running.add(animation);
    const done = () => {
      running.delete(animation);
      if (byElement.get(element) === animation) byElement.delete(element);
      cleanup?.();
    };
    animation.onfinish = done;
    animation.oncancel = done;
  }
  function reveal(element, y = 7, delay = 0) {
    play(element, [{opacity:0, transform:`translateY(${y}px)`}, {opacity:1, transform:'translateY(0)'}], duration, delay);
  }
  function cancelMotion() {
    restoreNavigation();
    for (const animation of [...running]) animation.cancel();
    document.querySelectorAll('.motion-date-ink').forEach(node => node.remove());
  }
  reduce.addEventListener('change', () => { if (reduce.matches) cancelMotion(); });
  printing.addEventListener('change', () => { if (printing.matches) cancelMotion(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelMotion(); });

  let lastStep = steps.findIndex(step => !step.hidden);
  let lastFinished = settings.hidden;
  // 观察稳定的容器属性，避免为每个日期单独注册观察器。
  const observer = new MutationObserver(() => {
    const nextStep = steps.findIndex(step => !step.hidden);
    const finished = settings.hidden;
    if (finished !== lastFinished) {
      if (finished) {
        play(canvas, [{opacity:.85}, {opacity:1}], 400);
        reveal($('continue-edit'), 3);
      } else play(settings, [{opacity:0}, {opacity:1}]);
    } else if (!finished && nextStep !== lastStep) {
      const x = nextStep > lastStep ? 12 : -12;
      play(steps[nextStep], [{opacity:0,transform:`translateX(${x}px)`},{opacity:1,transform:'translateX(0)'}]);
      reveal($('mode-message'), 3);
    }
    lastStep = nextStep;
    lastFinished = finished;
  });
  [settings,...steps].forEach(element => observer.observe(element, {attributes:true,attributeFilter:['hidden']}));

  // 渲染前记录日期，下一帧装饰对应按钮；业务动作按原时机执行一次。
  document.addEventListener('click', event => {
    const button = event.target.closest?.('.date-button[data-date]');
    if (!button || button.disabled || !allowed()) return;
    const date = button.dataset.date;
    requestAnimationFrame(() => {
      const current = [...calendar.querySelectorAll('[data-date]')].find(node => node.dataset.date === date);
      if (!current || current.disabled || !allowed()) return;
      const ink = document.createElement('span');
      ink.className = 'motion-date-ink';
      ink.setAttribute('aria-hidden','true');
      current.append(ink);
      play(ink, [{opacity:.6,transform:'scale(.90)'},{opacity:0,transform:'scale(1)'}], 260, 0, () => ink.remove());
    });
  }, true);

  reveal(document.querySelector('.topbar'), 4);
  reveal(document.querySelector('.preview-heading'), 6, 30);
  reveal(canvas, 9, 60);
  reveal(settings, 9, 90);
  return { navigate, position };
}
