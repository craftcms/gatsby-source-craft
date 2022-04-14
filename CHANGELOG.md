# Release Notes

## 3.0.0 - Unreleased
- Added support for Gatsby 4.

## 2.0.7 - 2022-04-13
- Fixed a bug that could prevent a site build from completing in some cases.

## 2.0.6 - 2022-02-08
- Added the `fetchOptions` option, for customizing the options passed to node-fetch. ([#71](https://github.com/craftcms/gatsby-source-craft/pull/71))
- Added the `retryOptions` option, for customizing the options passed to p-retry in the event of an API request failure.  ([#71](https://github.com/craftcms/gatsby-source-craft/pull/71))

## 2.0.5 - 2021-12-01
- Gatsby Helper 1.1.0 or later is now required.
- Fixed an incompatibility with Craft’s `gqlTypePrefix` config setting. ([#58](https://github.com/craftcms/gatsby-source-craft/issues/58))
- Fixed a deprecation error when using Craft 3.7 or later.

## 2.0.4 - 2021-10-19
- Improved multi-site support for elements that aren’t enabled for all sites. ([#50](https://github.com/craftcms/gatsby-source-craft/issues/50))

## 2.0.3 - 2021-08-19
- Updated gatsby-graphql-source-toolkit to 2.x.

## 2.0.2 - 2021-05-24
- Fixed a bug where it wasn’t possible for Gatsby to source non-live elements. ([#30](https://github.com/craftcms/gatsby-source-craft/issues/30))

## 2.0.0 - 2021-03-16
- Added support for Gatsby 3.

## 1.0.2 - 2021-05-24
- Fixed a bug where it wasn’t possible for Gatsby to source non-live elements. ([#30](https://github.com/craftcms/gatsby-source-craft/issues/30))

## 1.0.0 - 2021-03-16
- Fixed a bug where it wasn’t possible to query the `localFile` field on assets that contained non-ASCII characters in the URL. ([#25](https://github.com/craftcms/gatsby-source-craft/issues/25))

## 1.0.0-beta.3 - 2021-01-27
- Craft’s GraphQL API settings can now also be configured from the [Gatsby Helper](https://plugins.craftcms.com/gatsby-helper) plugin settings.
- Fixed a couple errors that could occur when building the Gatsby site. ([#18](https://github.com/craftcms/gatsby-source-craft/issues/18), [#19](https://github.com/craftcms/gatsby-source-craft/issues/19))
- Fixed a bug where some fields that couldn’t be resolved automatically were getting included in Gatsby’s GraphQL schema.

## 1.0.0-beta.2 - 2020-11-26
- Assets now have a `localFile` field, which can be used to generate transforms with `gatsby-transform-sharp`.

## 1.0.0-beta.1.1 - 2020-11-03
- Cleanup.

## 1.0.0-beta.1 - 2020-11-03
- Initial release
