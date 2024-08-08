// CommonJS application

// IMPORTS
// -------
const { mainExec } = require("./pdfetch_modules/business/main");

// HELPERS
// -------
/**
 * Simple monitoring function. Prints to console and returns a Boolean indicating
 * whether received data appears to denote an error.
 *
 * @param   {Object} info
 *          Object containing keys `type` (String), `message` (String) and
 *          `data` (Object, optional).
 *
 * @returns {Boolean} Returns `true` when given `info` has `type`="error". Returns
 *          `false` otherwise.
 */
const monitoringFn = (info) => {
  if (!info || typeof info !== "object") {
    console.error("[ERROR] Invalid info object provided to monitoringFn.");
    return true;
  }

  const { type = "", message = "", data = "" } = info;
  const normalizedType = ("" + type).trim().toLowerCase();
  const isError = normalizedType === "error";

  console.log(`[${normalizedType.toUpperCase()}] ${message}`, data || "");

  return isError;
};

// MAIN
// ----

// Data to populate the initial configuration file with
const configDefaults = {
  appName: "pdFetch",
  appAuthor: "Claudius Iacob <claudius.iacob@stefanini.com>",
  appVersion: "1.0.0",
  appDescription:
    "Exports KB articles from a ServiceNow instance as PDF files.",
};

// Template to initialize the configuration file based on
const configFileTemplate = `{
	"app_info":{
		"name":"{{appName}}",
		"author":"{{appAuthor}}",
		"version":"{{appVersion}}",
		"description":"{{appDescription}}"
	},
	"profiles":[
		{
			"name":"profile_1",
			"description":"Sample profile to get you started. Replace this with something meaningful.",
			"settings":{
				"sn_instance_name":"acme",
				"sn_user_name":"john.doe",
				"sn_pass":"letmein1234",
				"sn_query":"",
				"output_dir":"/path/to/my/acme/folder",
				"storage_mode":"",
				"operation_mode":""
			}
		}
	]
}`;

// Default values for some of the optional arguments
const appArgDefaults = {
  storage_mode: "files",
  operation_mode: "list_files",
};

// Definition of application arguments in the format expected by `getArguments()`.
// NOTE: the `mandatory` key is not needed by `getArguments()`, but it's convenient
// to place it there, and the `getArguments` function won't mind.
const appArgs = [
  {
    name: "Output directory",
    payload: /^--(output_dir|od)=(.+)$/,
    doc: "The working directory for the program. All downloads and generated content (except the configuration file) will be placed in this directory. It must be an absolute and valid path to an already existing folder.",
    mandatory: true,
  },
  {
    name: "ServiceNow instance name",
    payload: /^--(sn_instance_name|sni)=(.+)$/,
    doc: "The name of the ServiceNow instance to connect to, e.g., `acme` in `acme.service-now.com`.",
    mandatory: true,
  },
  {
    name: "ServiceNow user name",
    payload: /^--(sn_user_name|snu)=(.+)$/,
    doc: "The username to connect to the ServiceNow instance using a local account, e.g., `john.doe`. Special characters must be escaped based on the operating system.",
    mandatory: true,
  },
  {
    name: "ServiceNow password",
    payload: /^--(sn_pass|snp)=(.+)$/,
    doc: "The password for the username used to connect. Special characters must be escaped based on the operating system.",
    mandatory: true,
  },
  {
    name: "Help",
    payload: /^--(help|h)$/,
    doc: "Displays information about the program's input parameters and stops execution, even if other parameters have been provided.",
    mandatory: false,
  },
  {
    name: "Configuration File Initialization",
    payload: /^--(init_config|ic)$/,
    doc: "Initializes an empty configuration file in the user's home directory and stops execution, even if other parameters have been provided. The home directory depends on the current operating system, e.g., on Windows, it is usually `C:\\users\\<userName>`. Unix systems offer a shortcut to access it: `~/`. The configuration file is named `pdFetch.config`. The file has a JSON structure. The configuration file is an OPTIONAL way to save input parameters for the `pdFetch` program in groups called `profiles`. Such saved profiles can be loaded at the program start by using the `config_profile=...` parameter. Data loaded from a profile are default values and can be overridden from the command line by explicitly specifying a parameter. The program also supports a special type of profile. The `default` profile, if defined, will always be loaded, and its data will become default values that can be overridden by data from a subsequently mentioned profile and/or explicitly provided command-line parameters.",
    mandatory: false,
  },
  {
    name: "Configuration Profile Selection",
    payload: /^--(config_profile|cp)=(.+)$/,
    doc: "Loads default data from a configuration profile, assuming it has been defined (and assuming a configuration file exists). See the information about the `Configuration File Initialization` parameter for more details.",
    mandatory: false,
  },
  {
    name: "ServiceNow query",
    payload: /^--(sn_query|snq)=(.+)$/,
    doc: "Filter to add to the default filter used to retrieve articles. The default filter is `workflow_state=published` and cannot be removed. The `snq` parameter can be used, for example, to limit the listing of articles to a specific domain (`sys_domain=acbd1234`), useful if the user has access to multiple domains.",
    mandatory: false,
  },
  {
    name: "Storage mode",
    payload: /^--(storage_mode|sm)=(files|archived_files|single_file)$/,
    doc: "How the downloaded and generated content is stored in the working directory. Possible values:\n1. `files`: DEFAULT VALUE; creates PDF files in a `PDFs` subfolder of the working directory.\n2. `archived_files`: creates an archive of the downloaded/generated PDF files. The archive includes the name of the ServiceNow instance from which the download was made and is saved in the root of the working directory.\n3. `single_file`: creates a combined PDF file of all the downloaded/generated PDF files. The combined file includes the name of the ServiceNow instance from which the download was made and is saved in the root of the working directory.",
    mandatory: false,
  },
  {
    name: "Operation mode",
    payload:
      /^--(operation_mode|om)=(list|list_changes|list_files|list_changes_files)$/,
    doc: "The operations performed by the application and how it handles the KB articles it finds. Possible values:\n1. `list`: only downloads a list of available articles, but not the files themselves. The resulting file is named `file_list.json` and is saved in the root of the working directory.\n2. `list_changes`: based on an older list of available articles, creates a list of changes. The resulting file is named `file_changes.json` and is saved in the root of the working directory. For this mode to operate, an older `file_list.json` must exist in the root of the working directory.\n3. DEFAULT VALUE; `list_files`: same as the `list` mode, but also downloads/generates a PDF file for each entry listed in `file_list.json`. The resulting PDF files are placed in a `PDFs` subfolder of the working directory.\n4. `list_changes_files`: same as the `list_changes` mode, but based on the `file_changes.json` list, the PDF files available in the `PDFs` subfolder of the working directory are selectively deleted and/or (re)downloaded, ensuring the `PDFs` subfolder is up to date with the current state of the KB articles from the source ServiceNow instance.",
    mandatory: false,
  },
];

// Execute the program
mainExec(
  {
    configDefaults,
    configFileTemplate,
    appArgDefaults,
    appArgs,
  },
  monitoringFn
);
