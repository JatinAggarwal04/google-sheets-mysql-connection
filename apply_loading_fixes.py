
import os

file_path = '/Users/jatinaggarwal/Documents/GitHub/google-sheets-mysql-connection/Untitled/client/src/pages/AddIntegration.tsx'

with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip_until = -1

for i, line in enumerate(lines):
    if i < skip_until:
        continue

    # 1. Google Connections Map Button - Add disabled
    if "{googleConnections.map(conn => (" in line:
        new_lines.append(line)
        continue
    
    # Check if we are inside the Google map loop buttons
    # Pattern: <button ... key={conn.id} ... onClick... >
    if "key={conn.id}" in line and "selectedGoogleConnection" in lines[i+1]:
        new_lines.append(line)
        new_lines.append(lines[i+1])
        new_lines.append(lines[i+2]) # onClick
        # Insert disabled prop
        new_lines.append("                                            disabled={isGoogleConnecting}\n")
        continue

    # 2. Google Add New Button - Replace Block
    if 'className="connection-option add-new"' in line and 'onClick={handleConnectGoogle}' in line:
        new_lines.append('                                    <button \n')
        new_lines.append('                                        className="connection-option add-new" \n')
        new_lines.append('                                        onClick={handleConnectGoogle}\n')
        new_lines.append('                                        disabled={isGoogleConnecting}\n')
        new_lines.append('                                    >\n')
        new_lines.append('                                        <div className="connection-icon">\n')
        new_lines.append('                                            {isGoogleConnecting ? <Loader2 size={20} className="spin" /> : <Plus size={20} />}\n')
        new_lines.append('                                        </div>\n')
        new_lines.append('                                        <div className="connection-info">\n')
        new_lines.append('                                            <span className="connection-name">\n')
        new_lines.append("                                                {isGoogleConnecting ? 'Connecting...' : 'Connect New Account'}\n")
        new_lines.append('                                            </span>\n')
        new_lines.append('                                            <span className="connection-type">Add Google account via OAuth</span>\n')
        new_lines.append('                                        </div>\n')
        new_lines.append('                                    </button>\n')
        
        # Skip until </button>
        temp_idx = i
        while temp_idx < len(lines) and "</button>" not in lines[temp_idx]:
             temp_idx += 1
        skip_until = temp_idx + 1
        continue

    # 3. MySQL Connections Map Button - Replace Block
    if "{mysqlConnections.map(conn => (" in line:
        new_lines.append(line)
        continue

    if "key={conn.id}" in line and "selectedMysqlConnection" in lines[i+1]:
        # <button key=...>
        new_lines.append(line)
        # className=...
        new_lines.append(lines[i+1])
        
        # onClick replacement
        new_lines.append("                                            onClick={async () => {\n")
        new_lines.append("                                                if (selectedMysqlConnection === conn.id) return; // Already selected\n")
        new_lines.append("                                                setSelectedMysqlConnection(conn.id);\n")
        new_lines.append("                                                setIsMysqlSelecting(true);\n")
        new_lines.append("                                                await loadMysqlTables(conn.id);\n")
        new_lines.append("                                                setIsMysqlSelecting(false);\n")
        new_lines.append("                                            }}\n")
        new_lines.append("                                            disabled={isMysqlSelecting}\n")
        new_lines.append("                                        >\n")
        
        # Now we need to skip the original onClick and the opening >
        # Original: 
        # onClick={() => { ...
        #    ...
        # }}
        # >
        temp_idx = i + 2
        while temp_idx < len(lines) and "}}" not in lines[temp_idx]:
            temp_idx += 1
        # temp_idx is at "}}"
        # The next line should be ">" or contained in the same line?
        # Usually distinct line based on previous view_file.
        # Let's check if next line is strictly closing brace.
        # Assuming next line is `                                        >`
        
        # But wait, we also need to replace the ICON inside to show loader.
        # The structure inside is:
        # <div class="connection-icon mysql">
        #   <Database ... />
        # </div>
        
        new_lines.append('                                            <div className="connection-icon mysql">\n')
        new_lines.append('                                                {isMysqlSelecting && selectedMysqlConnection === conn.id ? (\n')
        new_lines.append('                                                    <Loader2 size={20} className="spin" />\n')
        new_lines.append('                                                ) : (\n')
        new_lines.append('                                                    <Database size={20} />\n')
        new_lines.append('                                                )}\n')
        new_lines.append('                                            </div>\n')
        
        # Now skip the original icon div
        # Find start of icon div
        temp_idx2 = temp_idx + 1 # After }}
        # It normally goes:
        # >
        # <div className="connection-icon mysql">
        #   <Database size={20} />
        # </div>
        
        # We need to skip until </div> of the icon.
        while temp_idx2 < len(lines) and 'className="connection-icon mysql"' not in lines[temp_idx2]:
             temp_idx2 += 1
        
        # Now at <div class=icon>
        # Skip until /div
        while temp_idx2 < len(lines) and "</div>" not in lines[temp_idx2]:
             temp_idx2 += 1
        
        skip_until = temp_idx2 + 1
        continue

    # 4. MySQL Add New Button - Add disabled
    if 'className="connection-option add-new"' in line and 'setShowNewMysqlForm(true)' in line:
         # Only add disabled here, no loader needed as it's just a toggle
         new_lines.append(line.replace('onClick', 'disabled={isMysqlSelecting} onClick'))
         continue

    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)

print("Successfully applied loading UI fixes to AddIntegration.tsx")
