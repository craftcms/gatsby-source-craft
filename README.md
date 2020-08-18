<p align="center">
  <img src="craftcms-gatsby.svg" width="278" height="100" alt="Craft CMS + Gatsby">
</p>
<h1 align="center">Craft CMS source plugin for Gatsby</h1>

This Gatsby source plugin provides an integration with [Craft CMS](https://craftcms.com). It uses Craft’s [GraphQL API](https://docs.craftcms.com/v3/graphql.html) to make content within Craft available to Gatsby-powered front ends.

Available interfaces:

- `EntryInterface`
- `AssetInterface`
- `UserInterface`
- `GlobalSetIterface`
- `TagInterface`

Each of those also have a corresponding root field. Knowing this we can dynamically
detect specific types implementing those interfaces and construct queries
for sourcing.

Refer to [`gatsby-node.js`](./gatsby-node.js) for details.

# Usage:
Add an `.env` file to the root of this example with your API details:

```title:.env
CRAFTGQL_TOKEN=YOUR_TOKEN
CRAFTGQL_URL=https://craftcms-endpoint
```

We use `CRAFTGQL_TOKEN` in `Authorization: Bearer ${process.env.CRAFTGQL_TOKEN}`
