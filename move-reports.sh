#!/bin/bash

# Script to automatically move implementation reports to REPORTS folder
# Usage: ./move-reports.sh

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Searching for implementation reports...${NC}"

# Create REPORTS directory if it doesn't exist
if [ ! -d "REPORTS" ]; then
    mkdir -p REPORTS
    echo -e "${GREEN}✅ Created REPORTS directory${NC}"
fi

# Find all files matching the pattern *_IMPLEMENTATION_REPORTS.md or *Implementation Report.md
report_files=$(find . -maxdepth 1 -name "*_IMPLEMENTATION_REPORTS.md" -o -name "*Implementation Report.md" -o -name "*: *Implementation Report.md" 2>/dev/null)

if [ -z "$report_files" ]; then
    echo -e "${YELLOW}⚠️  No implementation reports found matching patterns:${NC}"
    echo -e "   - *_IMPLEMENTATION_REPORTS.md"
    echo -e "   - *Implementation Report.md"
    echo -e "   - *: *Implementation Report.md"
    exit 0
fi

# Count files
file_count=$(echo "$report_files" | wc -l)
echo -e "${GREEN}📊 Found $file_count implementation report(s)${NC}"

# Move each file and show progress
moved_count=0
while IFS= read -r file; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo -e "${BLUE}📄 Moving: ${filename}${NC}"
        
        # Check if file already exists in REPORTS
        if [ -f "REPORTS/$filename" ]; then
            echo -e "${YELLOW}⚠️  File already exists in REPORTS, creating backup...${NC}"
            timestamp=$(date +"%Y%m%d_%H%M%S")
            mv "REPORTS/$filename" "REPORTS/${filename%.md}_backup_${timestamp}.md"
            echo -e "${GREEN}✅ Backup created: ${filename%.md}_backup_${timestamp}.md${NC}"
        fi
        
        # Move the file
        mv "$file" "REPORTS/"
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Moved to REPORTS/${filename}${NC}"
            ((moved_count++))
        else
            echo -e "${RED}❌ Failed to move ${filename}${NC}"
        fi
    fi
done <<< "$report_files"

echo ""
echo -e "${GREEN}🎉 Summary: Moved $moved_count out of $file_count reports to REPORTS folder${NC}"

# Show contents of REPORTS directory
echo ""
echo -e "${BLUE}📁 REPORTS directory contents:${NC}"
ls -la REPORTS/ | grep -E "\.(md|txt)$" | awk '{print "   " $9 " (" $5 " bytes) - " $6 " " $7 " " $8}'

echo ""
echo -e "${GREEN}✅ Report organization complete!${NC}"