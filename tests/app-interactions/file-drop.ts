import type { Locator } from '@playwright/test';

export type TestDropFile = {
  content: string;
  name: string;
  type: string;
};

export const dispatchFileDrag = async (
  target: Locator,
  eventType: 'dragenter' | 'dragleave' | 'dragover' | 'drop',
  files: TestDropFile[],
) => {
  await target.evaluate((element, payload) => {
    const dataTransfer = new DataTransfer();
    payload.files.forEach(file => {
      dataTransfer.items.add(new File([file.content], file.name, { type: file.type }));
    });
    element.dispatchEvent(new DragEvent(payload.eventType, {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  }, { eventType, files });
};
