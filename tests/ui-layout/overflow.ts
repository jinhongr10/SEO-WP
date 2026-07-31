import { expect, type Page } from '@playwright/test';

type LayoutIssue = {
  kind: 'document-overflow' | 'element-overflow' | 'overlap' | 'clipped-button' | 'button-content-overflow';
  selector: string;
  detail: string;
};

export const expectNoUnexpectedOverflow = async (page: Page) => {
  const issues = await page.evaluate<LayoutIssue[]>(() => {
    const result: LayoutIssue[] = [];
    const root = document.querySelector<HTMLElement>('[data-layout-root]');
    if (!root) return [{ kind: 'element-overflow', selector: '[data-layout-root]', detail: 'layout root missing' }];
    const allowedPolicies = new Set(['x-scroll', 'y-scroll', 'truncate', 'clip-media', 'app-shell']);
    const selectorFor = (element: Element) => {
      const testId = element.getAttribute('data-testid');
      const contract = element.getAttribute('data-layout-contract');
      if (testId) return `[data-testid="${testId}"]`;
      if (contract) return `[data-layout-contract="${contract}"]`;
      const className = typeof (element as HTMLElement).className === 'string'
        ? (element as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
        : '';
      return `${element.tagName.toLowerCase()}${className ? `.${className}` : ''}`;
    };
    const isVisible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const hasAllowedPolicy = (element: HTMLElement, axis: 'x' | 'y') => {
      const owner = element.closest<HTMLElement>('[data-overflow-policy]');
      if (!owner) return false;
      const policy = owner.dataset.overflowPolicy || '';
      if (!allowedPolicies.has(policy)) return false;
      if (policy === 'clip-media' || policy === 'truncate') return true;
      if (policy === 'x-scroll') return axis === 'x';
      if (policy === 'y-scroll') return axis === 'y';
      return policy === 'app-shell' && owner === element;
    };
    const isDecorativeCheckboxHoverOverflow = (element: HTMLElement) => (
      element.classList.contains('arco-icon-hover')
      && element.classList.contains('arco-checkbox-icon-hover')
    );

    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      result.push({
        kind: 'document-overflow',
        selector: 'html',
        detail: `scrollWidth=${document.documentElement.scrollWidth}, viewport=${window.innerWidth}`,
      });
    }

    for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      if (!isVisible(element)) continue;
      const style = getComputedStyle(element);
      if (style.position === 'absolute' || style.position === 'fixed') continue;
      if (
        !hasAllowedPolicy(element, 'x')
        && !isDecorativeCheckboxHoverOverflow(element)
        && element.clientWidth > 0
        && element.scrollWidth > element.clientWidth + 1
      ) {
        result.push({
          kind: 'element-overflow',
          selector: selectorFor(element),
          detail: `scrollWidth=${element.scrollWidth}, clientWidth=${element.clientWidth}`,
        });
      }
      if (!hasAllowedPolicy(element, 'y') && element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 6) {
        const textPreview = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        result.push({
          kind: 'element-overflow',
          selector: selectorFor(element),
          detail: `scrollHeight=${element.scrollHeight}, clientHeight=${element.clientHeight}${textPreview ? `, text=${textPreview}` : ''}`,
        });
      }
    }

    for (const group of Array.from(root.querySelectorAll<HTMLElement>('[data-layout-contract="action-group"]'))) {
      const children = Array.from(group.children).filter((child): child is HTMLElement => child instanceof HTMLElement && isVisible(child));
      for (let index = 0; index < children.length; index += 1) {
        const first = children[index].getBoundingClientRect();
        for (let next = index + 1; next < children.length; next += 1) {
          const second = children[next].getBoundingClientRect();
          const overlapX = Math.min(first.right, second.right) - Math.max(first.left, second.left);
          const overlapY = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
          if (overlapX > 1 && overlapY > 1) {
            result.push({ kind: 'overlap', selector: selectorFor(group), detail: `children ${index} and ${next} overlap` });
          }
        }
      }
    }

    const rootRect = root.getBoundingClientRect();
    for (const button of Array.from(root.querySelectorAll<HTMLElement>('button'))) {
      if (!isVisible(button)) continue;
      const rect = button.getBoundingClientRect();
      if (!hasAllowedPolicy(button, 'x') && (rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1)) {
        result.push({ kind: 'clipped-button', selector: selectorFor(button), detail: `button bounds ${rect.left}-${rect.right}, root ${rootRect.left}-${rootRect.right}` });
      }
      if (
        (!hasAllowedPolicy(button, 'x') && button.scrollWidth > button.clientWidth + 1)
        || (!hasAllowedPolicy(button, 'y') && button.scrollHeight > button.clientHeight + 3)
      ) {
        result.push({
          kind: 'button-content-overflow',
          selector: selectorFor(button),
          detail: `scroll=${button.scrollWidth}x${button.scrollHeight}, client=${button.clientWidth}x${button.clientHeight}`,
        });
      }
      for (const child of Array.from(button.querySelectorAll<HTMLElement>('[data-navigation-card-description], .arco-btn-content'))) {
        if (!isVisible(child)) continue;
        const childRect = child.getBoundingClientRect();
        if (childRect.left < rect.left - 1 || childRect.right > rect.right + 1 || childRect.top < rect.top - 1 || childRect.bottom > rect.bottom + 1) {
          result.push({
            kind: 'button-content-overflow',
            selector: selectorFor(button),
            detail: `child bounds ${childRect.left},${childRect.top}-${childRect.right},${childRect.bottom} exceed button`,
          });
        }
      }
    }

    return result.slice(0, 30);
  });

  expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
};
