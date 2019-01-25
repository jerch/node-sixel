#!/bin/bash

# enable sixel scrolling
# set this to l for mlterm (swapped meaning)
echo -e "\x1b[?80h"

clear

echo "test different widths"
sixels='~ ~~ ~~~ ~~~~ ~~~~~ ~~~~~~ ~~~~~~~ ~~~~~~~~ ~~~~~~~~~ ~~~~~~~~~~ ~~~~~~~~~~~ ~~~~~~~~~~~~ ~~~~~~~~~~~~~'
for sixel in $sixels
do
echo -ne "###\x1bPq#2$sixel\x1b\\xxx"
read
done

clear

echo "test different heights - full sixel block"
echo -ne "###\x1bPq#2~~~~~~\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-~~~~~~\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-~~~~~~-~~~~~~\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-~~~~~~-~~~~~~-~~~~~~\x1b\\xxx"
read

clear

echo "test different heights - adding pixels downwards"
echo -ne "###\x1bPq#2~~~~~~-??????\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-@@@@@@\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-BBBBBB\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-FFFFFF\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-NNNNNN\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-^^^^^^\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-??????\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-@@@@@@\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-BBBBBB\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-FFFFFF\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-NNNNNN\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-^^^^^^\x1b\\xxx"
read
echo -ne "###\x1bPq#2~~~~~~-~~~~~~-~~~~~~\x1b\\xxx"
read

clear

echo "right border"
echo -ne "###\x1bPq#2!400~\x1b\\xxx"
read
echo -ne "###\x1bPq#2!450~\x1b\\xxx"
read
echo -ne "###\x1bPq#2!500~\x1b\\xxx"
read
echo -ne "###\x1bPq#2!1500~\x1b\\xxx"
read