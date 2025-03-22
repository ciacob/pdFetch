# Claudius Iacob

## pdFetch 1.0.0 Documentation

### **pdFetch** is a Node.js application designed to export Knowledge Base (KB) articles from a ServiceNow instance into PDF files.
It provides various modes of operation to handle different use cases, including listing articles, identifying changes, downloading listed articles as PDFs and keeping them up to date. It also provides special storage modes such as archiving or merging the individual PDF files.

### Scenarios

Typical scenarios where pdFetch can be employed include:

- **Exporting KB Articles to PDF**: For sharing knowledge base articles in a portable document format that can be easily viewed, printed, or archived.
- **Change Detection**: Identifying changes in KB articles over time, useful for maintaining up-to-date off-site documentation.
- **Integration with Text Processing Applications**: PDF files can be used as an interchange format for various unattended text processing applications that accept PDF input.

### Audience

pdFetch can be used:

- **Manually by a Human User**: A user can execute the application from the command line, providing the necessary arguments to perform the desired operation.
- **Mechanically by an Unattended System**: Once a configuration file is set up, the application can be run automatically, such as through a cronjob, to perform regular exports when articles are added removed or updated in a remote ServiceNow instance.

### How to Install

#### Prerequisites

- **Node.js**: Ensure that Node.js is installed on your system. You can download the latest LTS version from [https://nodejs.org](https://nodejs.org/en).
#### Installation
Use `npm` to install the application globally:
  ```sh
  npm install -g pdfetch
  ```
To quickly test the installation, type in your console:
   ```sh
   pdFetch --h
   ```

### How to Use It

#### Command-Line Arguments

Here are the command-line arguments that pdFetch accepts (they all have shorter variants, see `pdFetch --h` for details):

- `--output_dir=path/to/dir`: The working directory of the program. All downloads and content generations (except the configuration file) will be done in this directory. It must be an absolute path to an existing folder. (Mandatory)
- `--sn_instance_name=instance_name`: The name of the ServiceNow instance to connect to, e.g., acme in acme.service-now.com. (Mandatory)
- `--sn_user_name=user_name`: The username for connecting to the ServiceNow instance using a local account, e.g., john.doe. (Mandatory)
- `--sn_pass=password`: The password for the user. (Mandatory)
- `--help`: Displays information about the input parameters of the program and stops execution, even if other parameters have been provided.
- `--init_config`: Initializes an empty configuration file in the user's home directory and stops execution, even if other parameters have been provided. The configuration file name is `pdFetch.config`.
- `--config_profile=profile_name`: Loads default data from a configuration profile, assuming it has been defined and there is a configuration file.
- `--sn_query=query`: Additional filter to add to the default filter used for obtaining articles. The default filter is `workflow_state=published`, and is always prepended to what you provide here.
- `--storage_mode=mode`: Determines how the downloaded/generated content is stored in the working directory. Possible values are:
  - `files`: Creates PDF files in a `PDFs` subfolder (default).
  - `archived_files`: Creates an archive of the downloaded/generated PDF files.
  - `single_file`: Creates a combined PDF file of all the downloaded/generated PDF files.
- `--operation_mode=mode`: The operations the application performs. Possible values are:
  - `list`: Only downloads a list of available articles without downloading the files.
  - `list_changes`: Creates a list of changes based on an older list of available articles.
  - `list_files`: Downloads/generates a PDF file for each listed entry.
  - `list_changes_files`: Updates the `PDFs` subfolder to reflect the current state of articles.

#### Examples

**Listing Articles:**
```sh
node index.js --output_dir=/path/to/dir --sn_instance_name=acme --sn_user_name=john.doe --sn_pass=letmein1234 --operation_mode=list
```

**Listing Articles with Changes:**
```sh
node index.js --output_dir=/path/to/dir --sn_instance_name=acme --sn_user_name=john.doe --sn_pass=letmein1234 --operation_mode=list_changes
```

**Listing Articles and Downloading PDFs:**
```sh
node index.js --output_dir=/path/to/dir --sn_instance_name=acme --sn_user_name=john.doe --sn_pass=letmein1234 --operation_mode=list_files
```

### Default Values and Profiles

- **Default Profile**: The application first loads settings from a _default_ profile if one exists by this name, verbatim.
- **Specified Profile**: If a profile is specified using `--config_profile`, the values it defines override those in the _default_ profile.
- **Command-Line Arguments**: Finally, any given command-line arguments override any profile settings.

### Validating Arguments

- If mandatory arguments are missing, the application will exit early with an error message.
- If an argument given on the command line is not understood, the application will exit early as well.

### Caveats

#### Session Lock File

A `operation_in_progress.lock` file is created in the output directory when the application starts, and is removed when it exits. The lock file ensures that the application does not run multiple instances simultaneously on the same directory, which could lead to data corruption or unexpected behavior.

**Caveat**: If the application is stopped abruptly, the lock file will remain, and the application will refuse to work on subsequent runs.

**Solution**: Manually delete the lock file. It is recommended to delete everything in the target directory in such cases.

### Bash Examples

**Running the Application:**
```sh
pdFetch --output_dir=/path/to/dir --sn_instance_name=acme \
--sn_user_name=john.doe --sn_pass=letmein1234 --operation_mode=list_files
```

**Handling Exit Status:**
```sh
if pdFetch --output_dir=/path/to/dir --sn_instance_name=acme \
--sn_user_name=john.doe --sn_pass=letmein1234 --operation_mode=list_files; then
  echo "pdFetch ran successfully"
else
  echo "pdFetch encountered an error"
fi
```

**Running from a Cronjob**: Add the following line to your crontab (edit with `crontab -e` and enter everything on just one line):
```sh
0 2 * * * pdFetch --output_dir=/path/to/dir --sn_instance_name=acme --sn_user_name=john.doe --sn_pass=letmein1234 --operation_mode=list_changes_files --storage_mode=files
```
This will run pdFetch every day at 2 AM, listing changes and downloading files as needed.

### Built-in documentation

Refer to the `--help` argument for an abridged version of this file.