
import os

file_path = '/Users/jatinaggarwal/Documents/GitHub/google-sheets-mysql-connection/Untitled/client/src/pages/AddIntegration.tsx'

with open(file_path, 'r') as f:
    lines = f.readlines()

# Identify split points
start_junk_index = -1
end_junk_index = -1

for i, line in enumerate(lines):
    if "const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);" in line:
        start_junk_index = i
        break

for i, line in enumerate(lines):
    if i > start_junk_index and "const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<string | null>(null);" in line:
        end_junk_index = i
        break

if start_junk_index != -1 and end_junk_index != -1:
    print(f"Found junk from line {start_junk_index + 1} to {end_junk_index}")
    
    # Construct restored block (Original lines 61-80 + new state vars)
    restored_block = [
        "    const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);\n",
        "    const [isMysqlSelecting, setIsMysqlSelecting] = useState(false);\n",
        "\n",
        "    // Step 1: Google Connection\n",
        "    const [googleConnections, setGoogleConnections] = useState<GoogleConnection[]>([]);\n",
        "    const [selectedGoogleConnection, setSelectedGoogleConnection] = useState<string | null>(null);\n",
        "    const [showGoogleDisclaimer, setShowGoogleDisclaimer] = useState(false);\n",
        "\n",
        "    // Step 2: MySQL Connection\n",
        "    const [mysqlConnections, setMysqlConnections] = useState<MySQLConnection[]>([]);\n",
        "    const [selectedMysqlConnection, setSelectedMysqlConnection] = useState<string | null>(null);\n",
        "    const [showNewMysqlForm, setShowNewMysqlForm] = useState(false);\n",
        "    const [newMysqlForm, setNewMysqlForm] = useState({\n",
        "        name: '',\n",
        "        host: '',\n",
        "        port: 3306,\n",
        "        database: '',\n",
        "        username: '',\n",
        "        password: '',\n",
        "    });\n",
        "\n",
        "    // Step 3: Sheet Selection\n",
        "    const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);\n"
    ]

    # Combine: Header + Restored + Footer (starting from selectedSpreadsheet)
    new_lines = lines[:start_junk_index] + restored_block + lines[end_junk_index:]
    
    with open(file_path, 'w') as f:
        f.writelines(new_lines)
    print("Successfully repaired AddIntegration.tsx")
else:
    print("Could not find junk patterns. File might be different than expected.")
