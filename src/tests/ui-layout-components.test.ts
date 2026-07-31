import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ActionGroup,
  Badge,
  NavigationCardButton,
  OverflowText,
  PanelHeader,
  PanelHeaderActions,
  StatusPill,
  TableShell,
  Toolbar,
} from "../../components/ui";

test("OverflowText exposes explicit wrap and controlled truncation contracts", () => {
  const wrapped = renderToStaticMarkup(React.createElement(
    OverflowText,
    { strategy: "break-anywhere" },
    "https://example.com/a-very-long-unbroken-resource-name",
  ));
  const truncated = renderToStaticMarkup(React.createElement(
    OverflowText,
    { strategy: "truncate", rows: 2 },
    "这是一段需要在紧凑组件中省略并展示完整提示的超长中文文本",
  ));

  assert.match(wrapped, /ui-overflow-text--break-anywhere/);
  assert.match(wrapped, /data-layout-contract="text-break-anywhere"/);
  assert.match(truncated, /ui-overflow-text--truncate/);
  assert.match(truncated, /data-overflow-policy="truncate"/);
  assert.match(truncated, /--ui-overflow-rows:2/);
  assert.match(truncated, /aria-label="这是一段需要在紧凑组件中省略并展示完整提示的超长中文文本"/);
});

test("ActionGroup and Toolbar separate shrinkable content from wrapping actions", () => {
  const html = renderToStaticMarkup(React.createElement(Toolbar, {
    start: React.createElement("div", null, "一段很长的工作区标题"),
    actions: React.createElement(
      ActionGroup,
      { minItemWidth: 132 },
      React.createElement("button", null, "生成预览"),
      React.createElement("button", null, "同步 WordPress"),
    ),
  }));

  assert.match(html, /data-layout-contract="toolbar"/);
  assert.match(html, /ui-toolbar__start/);
  assert.match(html, /ui-toolbar__actions/);
  assert.match(html, /data-layout-contract="action-group"/);
  assert.match(html, /--ui-action-min-width:132px/);
});

test("TableShell owns horizontal scrolling and declares its minimum content width", () => {
  const html = renderToStaticMarkup(React.createElement(
    TableShell,
    { minContentWidth: 960 },
    React.createElement("table", null, React.createElement("tbody", null)),
  ));

  assert.match(html, /data-overflow-policy="x-scroll"/);
  assert.match(html, /ui-table-shell__content/);
  assert.match(html, /--ui-table-min-width:960px/);
});

test("panel actions and compact labels expose non-crowding hooks", () => {
  const panel = renderToStaticMarkup(React.createElement(
    PanelHeader,
    null,
    React.createElement("div", null, "标题"),
    React.createElement(PanelHeaderActions, null, React.createElement("button", null, "操作")),
  ));
  const badge = renderToStaticMarkup(React.createElement(Badge, null, "非常长的状态标签"));
  const status = renderToStaticMarkup(React.createElement(StatusPill, null, "后台任务正在生成很长的状态文案"));

  assert.match(panel, /ui-panel__header-actions/);
  assert.match(badge, /data-overflow-policy="truncate"/);
  assert.match(status, /data-overflow-policy="truncate"/);
});

test("NavigationCardButton exposes an auto-height navigation layout contract", () => {
  const html = renderToStaticMarkup(React.createElement(NavigationCardButton, {
    title: "产品 / SKU 信息",
    description: "产品线、SKU、型号、规格、卖点、适用场景",
    count: 0,
    selected: true,
    onClick: () => undefined,
  }));

  assert.match(html, /data-layout-contract="navigation-card"/);
  assert.match(html, /ui-navigation-card--selected/);
  assert.match(html, /ui-navigation-card__content/);
  assert.match(html, /ui-overflow-text--truncate/);
  assert.match(html, /--ui-overflow-rows:2/);
  assert.match(html, /aria-pressed="true"/);
});
