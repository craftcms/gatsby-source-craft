<p align="center">
  <img src="craftcms-gatsby.svg" width="278" height="100" alt="Craft CMS + Gatsby">
</p>
<h1 align="center">Gatsby source plugin for Craft CMS</h1>

This Gatsby source plugin provides an integration with [Craft CMS](https://craftcms.com). It uses Craft’s [GraphQL API](https://docs.craftcms.com/v3/graphql.html) to make content within Craft available to Gatsby-powered front ends.

It requires for the corresponding [Gatsby Craft plugin](https://github.com/craftcms/craft-gatsby) to be installed on the Craft site.

---

## Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Overview](#overview)
- [Usage](#usage)
  - [Configuration Options](#configuration-options)
  - [Fetching Craft Content](#fetching-craft-content)
  - [Enabling Loose Interfaces](#enabling-loose-interfaces)
  - [Live Preview](#live-preview)
  - [Customizing Builds](#customizing-builds)
- [Differences from Other Source Plugins](#differences-from-other-source-plugins)
  - [Legacy `gatsby-source-craftcms`](#legacy-gatsby-source-craftcms)
  - [`gatsby-source-graphql`](#gatsby-source-graphql)
- [Troubleshooting](#troubleshooting)

---

## Requirements

- Craft CMS instance running with the [Gatsby Craft plugin](https://github.com/craftcms/craft-gatsby) installed and configured.
- Gatsby project you can work with locally.

## Quick Start

### 1. Install the Source Plugin

Install the Gatsby source plugin by running the following command in your terminal:

```
npm install --save-dev gatsby-source-craftcms
```

### 2. Configure the Source Plugin

At minimum, you’ll need to add or edit your Gatsby project’s `.env` file with environment variables that specify your Craft CMS GraphQL endpoint and token:

```title:.env
CRAFTGQL_TOKEN=your-graphql-token
CRAFTGQL_URL=https://your-craftcms-site.test/api
```

You’ll also need to add the Gatsby source plugin in [your `gatsby-config.js` file’s `plugins` array](https://www.gatsbyjs.com/docs/configuring-usage-with-plugin-options/#where-to-access-plugin-options):

```title:gatsby-config.js
  // ...
  plugins: [
    `gatsby-source-craftcms`
  ]
  // ...
```

You may optionally override any of the default [configuration options](#configuration-options) there as well:

```title:gatsby-config.js
  // ...
  plugins: [
    {
      resolve: `gatsby-source-craftcms`,
      options: {
        concurrency: 12,
        typePrefix: `CraftGQL_`
      }
  ]
  // ...
```

### 3. Confirm Success

Run `gatsby develop` and you should be able to watch Gatsby source the entire Craft CMS schema. When it’s finished, you should be able to query your Craft content running http://localhost:8000/___graphql.

Now you’re ready to [query Craft CMS content](#fetching-craft-content) and build a blazing-fast Gatsby front end!

## Overview

Craft’s flexible content schema is accessible front ends via [Element Queries](https://craftcms.com/docs/3.x/element-queries.html) and a similar public GraphQL API. This Gatsby source plugin, combined with its companion Craft CMS plugin, translates your Craft project schema specifically for Gatsby’s internal GraphQL API.

<img src="graphql-diagram.png" alt="Diagram of Craft CMS via source plugin to private Gatsby GraphQL">

Gatsby uses source plugins like this to collect content from any number of sources (local markdown, REST and GraphQL APIs, etc.) and combine them in a single, consistent GraphQL API that can be used to build a [React](https://reactjs.org/)-based front end.

If you’re a hands-on learner, the quickest way to appreciate the difference between these GraphQL APIs is to see each in action. Open GraphiQL from the Craft control panel and run `gatsby develop` before visiting http://localhost:8000/___graphql. Gatsby’s GraphQL API is the one you’ll query when building your Gatsby site.

If you’re a learn-by-reading type that’s new to Craft CMS, you may first want to look at Craft’s [GraphQL API](https://craftcms.com/docs/3.x/graphql.html) see how you’d fetch content directly. It’ll probably help make sense of the schema available to Gatsby. If you’re new to Gatsby, the [Gatsby Tutorials](https://www.gatsbyjs.com/tutorial/) offer an excellent start with the basics.

> 💡 Tip: take a look at the [Craft CMS Blog Starter](https://github.com/craftcms/starter-blog) if you’d like to see an example Craft+Gatsby integration that uses this source plugin.

## Usage

### Configuration Options

| Option            | Default                          | Description |
| ----------------- | -------------------------------- | ----------- |
| `concurrency`     | `10`                             | Number of concurrent connections to use querying Craft.
| `debugDir`        | `.cache/craft-graphql-documents` | Directory for storing generated GraphQL documents for debugging.
| `fragmentsDir`    | `.cache/craft-fragments`         | Directory for storing GraphQL fragments.
| `typePrefix`      | `Craft_`                         | Craft schema type prefix. (Underscore is optional; see examples below.)
| `looseInterfaces` | `false`                          | Whether to allow filtering all Craft types by all available interfaces. (See [Enabling Loose Interfaces](#enabling-loose-interfaces).)

### Fetching Craft Content

Once your Craft CMS content schema has been sourced and translated into Gatsby data nodes, you’ll query those nodes from your Gatsby components.

If you’re new to Gatsby, this is a vital and potentially confusing distinction: **you’ll query Gatsby’s GraphQL API in your React components, and that’s different from Craft’s GraphQL API.**

The examples that follow assume you’re using the default `Craft_` type prefix. If you’ve specified a different one, like `Foo_` for example, the types in your queries would change slightly.

| `typePrefix: 'Craft_'`  | `typePrefix: 'Foo_'`  |
| ----------------------- | --------------------- |
| `Craft_blog_blog_Entry` | `Foo_blog_blog_Entry`
| `allCraftBlogBlogEntry` | `allFooBlogBlogEntry`
| `craftBlogBlogEntry`    | `fooBlogBlogEntry`

You’ll be able to query content to get either a single object or several of them that are returned in a `nodes` array. You can narrow the kind of content you’d like in two different ways:

1. As a specific element type, like a blog section and entry type.
2. As a generic content type, meaning content that may exist across *different* sections and entry types.

**Specific element types** will be accessible via `allCraft<camelCasedGraphQLType>` and `craft<camelCasedGraphQLType>`. For example, a `Blog` section and entry type would be available as `allCraftBlogBlogEntry` and `craftBlogBlogEntry`. Whether you’re dealing with one object or several, you won’t need to further specify each node’s type to query its custom content fields.

```graphql
# multiple blog post entry titles + custom field values
{
  allCraftBlogBlogEntry {
    nodes {
      title
      myCustomBlogField
    }
  }
}
# single blog post entry title + custom field values
{
  craftBlogBlogEntry {
    title
    myCustomBlogField
  }
}
```

**Generic content types** will be accessible via `allCraft<interfaceName>` and `craft<interfaceName>`. You’ll likely have, for example, `allCraftEntryInterface` and `craftEntryInterface`. These can fetch GraphQL objects that implement the Entry interface. In other words, entries that may exist in different sections and entry types.

```graphql
# multiple entry titles with custom *blog* field values
{
  allCraftEntryInterface {
    nodes {
      title
      ... on Craft_blog_blog_Entry {
        myCustomBlogField
      }
    }
  }
}
# single entry title with custom *blog* field value
{
  craftEntryInterface {
    title
    ... on Craft_blog_blog_Entry {
      myCustomBlogField
    }
  }
}
```

Different filters will be available depending on how you query content, and the quickest way to see what’s there is to open Gatsby’s GraphiQL interface (usually at http://localhost:8000/___graphql) and explore.

To query generic content types and select only blog channel entries, which would achieve the same result as the first example, you could do the following:

```graphql
# multiple entry titles with custom *blog* field values, but ... only from the blog
{
  allCraftBlogBlogEntry(filter: {sectionHandle: {eq: "blog"}}) {
    nodes {
      title
      ... on Craft_blog_blog_Entry {
        myCustomBlogField
      }
    }
  }
}
```

Keep in mind that the `id` you’ll receive for each object is Gatsby-specific. The element ID you’d be used to working with in Craft will be on the `remoteId` property instead.

The following query, for example...

```graphql
{
  craftBlogBlogEntry {
    title
    id
    remoteId
    remoteTypeName
  }
}
```

...might return...

```json
{
  "data": {
    "craftBlogBlogEntry": {
      "title": "Post One",
      "id": "blog_blog_Entry:10",
      "remoteId": "10",
      "remoteTypeName": "blog_blog_Entry"
    }
  }
}
```

...where `10` is the entry ID as you’d refer to it in Craft CMS. Similarly, Craft’s typename will be available as `remoteTypeName`.

Gatsby offers a nice tutorial on using GraphQL to build your site: https://www.gatsbyjs.com/docs/graphql/

### Enabling Loose Interfaces

> ⚠️ This is an experimental setting that allows deviation from an otherwise strict specification. Use at your own risk!

When `looseInterfaces` is enabled, the source plugin will add all fields to the GraphQL interfaces that are implemented by at least one of the GraphQL types. This allows for vastly more filterable queries to the detriment of clarity and readability for each specific type.

If your objects are books, bicycles, and birds, you’ve probably customized fields/properties that make immediate sense with `looseInterfaces` disabled:

- **books**
  - cover
  - pageCount
  - isbn
  - price
- **bicycles**
  - numGears
  - brakeType
  - price
- **birds**
  - beakShape
  - nestingLocation

As you encounter each type via the GraphQL API, you’ll see those properties as they’re presented above—but when querying generic content types you’ll only be able to limit your search by books, bicycles, and/or birds.

With `looseInterfaces` enabled, each result object will list the properties available across *all* types. The benefit is you can further limit the query scope by a more specific property. You might search all objects by price, for example, and end up with books and bicycles as results.

- **books**
  - cover
  - pageCount
  - isbn
  - price
  - numGears
  - brakeType
  - beakShape
  - nestingLocation
- **bicycles**
  - cover
  - pageCount
  - isbn
  - price
  - numGears
  - brakeType
  - beakShape
  - nestingLocation
- **birds**
  - cover
  - pageCount
  - isbn
  - price
  - numGears
  - brakeType
  - beakShape
  - nestingLocation

The downside is that each result may be more confusing to look at. Birds will have brake types, bicycles will have nesting locations, and books will have beak shapes—which does not reflect the nature of reality. The actual content does not change and the value of each irrelevant field would be `null`, but each type would include every other type’s properties.

> ⚠️ Filtering by a non-existent field [can result in unexpected behavior](https://www.gatsbyjs.com/docs/query-filters/#nulls-and-partial-paths). Make sure your other filter fields narrow the results down to a set of results that actually implement the field you’re filtering against.

### Live Preview

In order to support [live preview targets](https://craftcms.com/docs/3.x/entries.html#preview-targets) for Craft content editors, Gatsby must be running in development mode and the Craft CMS Gatsby plugin must be configured with the Gatsby development server’s URL.

TODO: detail setup steps

> ⚠️ Gatsby does not support rendering a page on its own - when you save a draft during the live preview, Gatsby rebuilds the entire site using the draft instead of the entry itself. Craft does its best to tell Gatsby when to rebuild the site again without using the draft, but it is possible that a site remains built with a draft instead of the published entry.

### Customizing Builds

When a build process is launched, the plugin will query the Craft site to understand what content is available. It then checks the fragments directory and uses any already cached there to speed things up. If a given part of the schema is not already represented by a cached fragment, one will be generated and saved instead.

#### Fragments Explained

Fragments are standard GraphQL speak for reusable chunks of GraphQL queries.

You can utilize fragments to help make your Gatsby project components more [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself). The source plugin uses them as a way of caching what’s often a complex Craft CMS content schema.

By default, Gatsby will fetch _everything_ from Craft. That doesn’t mean all your site’s content is displayed, but that Gatsby fully catalogs the schema so it can be available to use however and wherever you’d like within your Gatsby components.

Because fetching the entire schema is expensive, and because hand-writing schema fragments would be tedious and overwhelming, the source plugin’s strategy is to generate fragments for you—including Gatsby-specific fields and aliases—and save them locally to speed up subsquent builds.

Once those fragments are generated, you can edit them down by hand to remove anything you don’t want to be available. You can also remove them all—which is easiest using `gatsby clean` to have them fully regenerated in the next build process.

#### Building the Site

Gatsby sites are built by querying source nodes and processing the results.

If you’re new to Gatsby, be sure to read up on how to [build a site using source plugins](https://www.gatsbyjs.com/tutorial/part-five/).

Once data from *any* source, including Craft CMS, is converted into Gatsby data nodes, you’ll query those data nodes against Gatsby’s internal storage rather than the originating source. In this case that means the GraphQL queries you write in your Gatsby components will query Gatsby’s data nodes and not the Craft CMS GraphQL API.

Once everything’s cached on this first run, subsequent builds will apply delta changes and be much faster. (If Craft’s project config is changed or you run `gatsby clean`, the entire site will be sourced again.)

#### Applying Directives and Craft-Specific Filtering

TODO: explain what directives are

The most common scenario for adjusting the generated fragments is for creating custom fields or applying directives. Since directives are applied when Craft returns the data, they cannot be applied after Gatsby already has it. The same is true for applying filters that only Craft would know how to process.

Using [image transforms](https://craftcms.com/docs/3.x/image-transforms.html), for example, would require generating them when sourcing the data. Here we’ve modified the custom `frontPageThumb` asset field to specifically return a URL for an image pre-cropped to 400 pixels square:

TODO: should be `Craft_uploads_Asset` below? Trim down?
TODO: are we referring to a generated+cached fragment? (not seeing them)

```graphql
fragment uploads_Asset on uploads_Asset {
  remoteId: id
  uid
  title
  slug
  enabled
  url
  frontPageThumb: url(width: 400, height: 400)
}
```

## Differences from Other Source Plugins

### `gatsby-source-graphql`

Most Gatsby-Craft sites were likely built with the [`gatsby-source-graphql` plugin](https://www.gatsbyjs.com/plugins/gatsby-source-graphql/), which executes GraphQL queries at build time. This comes with two main disadvantages:

1. Because every GraphQL query is executed at build time, builds could be slow particularly with larger sites.
2. Every build is all-or-nothing, with no ability to partially source schema changes.

This Craft CMS Gatsby source plugin is tailored for optimal utilization of Craft’s content schema. It first sources *all* the data from the Craft site via its native GraphQL API, then converts everything into Gatsby data nodes. The complete schema is sourced into locally-cached fragments that speed up subsequent builds, so only schema *changes* need to be queried and sourced.

If you’re migrating a Gatsby project from the GraphQL source plugin to this Craft CMS source plugin, you’ll need to adjust your configuration and make some changes to your queries. They should generally be cleaner and slightly more concise:

- Queries will no longer need to be wrapped by the source handle. (`query { craft {} }` → `query {}`.)
- Multi-object queries will take the form of `allCraft*`, while single-object queries will start with `craft*` and no longer need to specify a type when a single section/entry type is queried.
- Queries for multiple objects (like `allCraft*`) will return results in a `nodes` array.
- Craft’s [`search`](https://craftcms.com/docs/3.x/searching.html) parameter is no longer available as a filter. It was a convenient hack for querying specific field values and relationships, both of which may be done more cleanly using this source plugin.
- References to any element’s `id` should be `remoteId` instead.
- Any user details, like entry author information, must be wrapped with `... on Craft_User {}`.
- Various casing will need to change, often from snake case (`blog_blog_Entry`) to camelCase (`BlogBlogEntry`). Only fragments continue to use snake case, like `... on Craft_blog_blog_Entry {}`.

### Legacy `gatsby-source-craftcms`

The [original Craft CMS source plugin](https://github.com/gusnips/gatsby-source-craftcms) was superseded by [`gatsby-source-graphql`](#gatsby-source-graphql). Despite having the same name, this Gatsby source plugin is built and maintained directly by the Craft CMS team.

## Troubleshooting

### Gatsby doesn’t see Craft schema changes.

When you add new fields, you have to keep in mind, that Gatsby will pull in only the content it is told to query - namely, whatever is specified in the GraphQL fragments. You either have to add the new fields to the already-existing fragments or you can simply clear out the fragment folder so that Gatsby regenerates them on the next run.

### Subsequent Gatsby builds have incomplete content.

When you run Gatsby subsequently, if Gatsby caches have not been cleaned out, Gatsby will only query Craft for changes since the last time Gatsby queried for content. This is called incremental sourcing and it helps reduce the data transferred between Gatsby and Craft. It also helps Gatsby re-build its data node store.

As new data is pulled in, though, Gatsby might not know all the relations made by Craft and also which relations might be used when building the site. (See the [related issue here](https://github.com/gatsbyjs/gatsby-graphql-toolkit/issues/18)). This means that sometimes incremental sourcing can make your site have some obsolete content. For this reason, it is recommended to do a full page build (by cleaning the Gatsby caches beforehand) before deploying the built site.


