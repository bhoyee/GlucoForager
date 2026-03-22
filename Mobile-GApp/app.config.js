const appJson = require("./app.json");

module.exports = () => {
  const expo = (appJson && appJson.expo) || {};

  // Use EAS "file environment variable" for google-services.json so it doesn't need to be committed.
  // In EAS, create a file secret named GOOGLE_SERVICES_JSON and set it to the path of your
  // `google-services.json` file; EAS will provide the downloaded file path in this env var.
  const googleServicesFileFromEnv = process.env.GOOGLE_SERVICES_JSON;

  return {
    expo: {
      ...expo,
      android: {
        ...(expo.android || {}),
        ...(googleServicesFileFromEnv
          ? { googleServicesFile: googleServicesFileFromEnv }
          : {}),
      },
    },
  };
};

