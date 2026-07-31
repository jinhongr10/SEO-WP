import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BlogSourceLink } from "../../components/BlogFormatDashboard";

describe("Blog format source links", () => {
  it("renders the original WordPress URL as a clickable link", () => {
    const html = renderToStaticMarkup(
      React.createElement(BlogSourceLink, {
        href: "https://example.com/automatic-vs-manual/",
      }),
    );

    assert.match(html, /href="https:\/\/example\.com\/automatic-vs-manual\/"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noreferrer"/);
    assert.match(html, />打开原文</);
  });
});
