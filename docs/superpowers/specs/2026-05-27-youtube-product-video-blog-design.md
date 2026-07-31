# YouTube Product Video Blog Design

## Goal

Add a fourth article type, `Product Video Blog`, to the existing `展会/证书/项目blog` workflow. The user can paste a YouTube product video URL, fetch the public title and description without using the YouTube API, then generate an English B2B WordPress draft that embeds the video and turns the description into a search-friendly product article.

## Scope

The first version supports one video at a time. It does not require YouTube Data API keys, OAuth, caption access, or transcript extraction. It creates WordPress drafts only, matching the existing `blogAi` behavior.

## User Workflow

1. Open `展会/证书/项目blog`.
2. Select `产品视频 Blog`.
3. Paste a YouTube video URL.
4. Click `读取视频信息`.
5. Review and edit the fetched title, description, thumbnail, channel name, published date, and embed URL.
6. Fill optional product fields such as model, category, key selling points, target buyer, CTA, related products, and related categories.
7. Generate an outline.
8. Review or edit the outline.
9. Generate the full article, SEO title, SEO description, excerpt, FAQ, CTA, and warnings.
10. Preview the Gutenberg-friendly HTML.
11. Save the post as a WordPress draft.

## UI Changes

The existing article type selector gains a fourth option:

- `产品视频 Blog`

When selected, the left-side form shows a YouTube video section:

- YouTube URL input
- `读取视频信息` button
- Editable video title
- Editable video description
- Read-only or editable channel name
- Read-only or editable published date
- Thumbnail preview
- Embed URL preview
- Product model
- Product category
- Key product selling points
- Target buyer or use scenario
- CTA notes

The fetched fields must remain editable because YouTube public page metadata can be missing, truncated, blocked, or changed by YouTube page structure updates.

## Frontend Data Model

Extend `BlogAIArticleType`:

- `exhibition`
- `certificate`
- `project`
- `video`

Add `BlogAIVideoFacts`:

- `youtubeUrl`
- `videoId`
- `title`
- `description`
- `thumbnailUrl`
- `channelName`
- `publishedAt`
- `embedUrl`
- `productModel`
- `productCategory`
- `keySellingPoints`
- `targetBuyer`
- `useScenario`
- `videoCta`

Extend `BlogAIDraftInput` with:

- `video: BlogAIVideoFacts`

## Backend Fetch API

Add:

- `POST /blog-ai/youtube/fetch`

Request:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

Response:

```json
{
  "videoId": "VIDEO_ID",
  "title": "Video title",
  "description": "Video description",
  "thumbnailUrl": "https://...",
  "channelName": "Demo Brand",
  "publishedAt": "2026-05-27",
  "embedUrl": "https://www.youtube.com/embed/VIDEO_ID",
  "warnings": []
}
```

The endpoint must not call YouTube Data API and must not require API keys or OAuth credentials.

## YouTube URL Parsing

Support common URL shapes:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`

The parser extracts the canonical 11-character video ID when possible. Invalid or unsupported URLs return a 400 response with a clear message.

## Public Metadata Extraction

The fetch endpoint requests the public YouTube page and uses layered parsing:

1. Parse embedded JSON such as `ytInitialPlayerResponse` for `videoDetails.title`, `videoDetails.shortDescription`, thumbnail data, and author/channel data.
2. Fall back to Open Graph and standard meta tags such as `og:title`, `og:description`, `og:image`, and `name="description"`.
3. Build `embedUrl` locally from the video ID using `https://www.youtube.com/embed/VIDEO_ID`.

If a field cannot be fetched, return the fields that are available and add a warning. Do not block the workflow if the video ID is valid. Even if the page request fails, the endpoint should still return `videoId`, `youtubeUrl`, and `embedUrl` so the user can manually fill the title and description.

## Article Generation Rules

The existing `/blog-ai/outline`, `/blog-ai/generate`, and `/blog-ai/create-draft` endpoints remain the generation and draft-save path.

For `articleType=video`, prompts must:

- Treat the YouTube title and description as the primary source of truth.
- Write an English B2B product video blog for deployment site buyers.
- Use Demo Brand/product facts only when they are present in the description or optional product fields.
- Avoid inventing test results, certifications, customer names, exact quantities, prices, countries, installation sites, or guarantees.
- Mention the video naturally and invite readers to watch it.
- Convert video description bullets into useful buyer-facing sections.
- Include practical product selection, application, maintenance, customization, volume order, or project procurement angles when supported.
- Return warnings when the description is thin or product facts are missing.

## WordPress Draft Behavior

Draft creation inserts the video near the top of the content, immediately after the opening introduction when possible. The embed should use WordPress core YouTube embed block markup and remain editable in Gutenberg.

The draft remains `status: draft`. It reuses existing draft behavior:

- Auto blog tags
- AIOSEO title and description sync when available
- FAQ appending in the standard blog format
- DOCX export from generated HTML

## Error Handling

The fetch endpoint returns warnings instead of hard failures when:

- YouTube blocks the page request.
- The title is available but the description is missing.
- The thumbnail is unavailable.
- Channel or published date cannot be found.

The endpoint returns an error only when:

- The URL is empty.
- No valid YouTube video ID can be parsed.

The UI displays warnings near the fetched fields and keeps the editable title/description fields available.

## Testing

Backend tests should cover:

- Video ID parsing for `watch`, `youtu.be`, `embed`, and `shorts` URLs.
- Invalid URLs returning a clear error.
- Metadata extraction from `ytInitialPlayerResponse`.
- Fallback extraction from Open Graph meta tags.
- Draft HTML includes a YouTube embed for `articleType=video`.
- Video facts appear in `_blog_ai_facts_summary`.

Frontend tests should cover:

- The article type selector renders `产品视频 Blog`.
- Selecting video mode renders YouTube URL and fetch controls.
- Video draft creation remains allowed without certificate confirmation.
- The blog AI service posts to `/blog-ai/youtube/fetch`.

## Acceptance Criteria

1. Pasting a valid YouTube product video URL can fetch title, description, thumbnail, video ID, and embed URL without YouTube API keys.
2. The fetched title and description are editable before generation.
3. A video article can generate an outline and full post using the existing AI flow.
4. The WordPress draft embeds the YouTube video near the top.
5. The draft is saved only as `draft`, not published.
6. The generated article follows the existing blog format and B2B SEO style.
7. The flow still works if only the video ID and title are available, with warnings shown to the user.

## Non-Goals

- YouTube Data API integration.
- YouTube OAuth.
- Caption or transcript extraction.
- Automatic batch generation from a YouTube channel or playlist.
- Uploading videos to YouTube.
- Publishing posts directly.
