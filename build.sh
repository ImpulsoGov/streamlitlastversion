curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -

echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list

sudo apt-get update

sudo apt install -y make build-essential libssl-dev zlib1g-dev libbz2-dev \
libreadline-dev libsqlite3-dev wget curl llvm libncurses5-dev libncursesw5-dev \
xz-utils tk-dev libffi-dev liblzma-dev python-openssl mysql-client libmysqlclient-dev unixodbc-dev

curl -L https://github.com/pyenv/pyenv-installer/raw/master/bin/pyenv-installer | bash

sudo apt install graphviz python3-distutils

sudo apt install yarn npm python3-pip protobuf-compiler libgconf-2-4

pip3 install pipenv

git clone https://github.com/ImpulsoGov/streamlit

pipenv --three

cd streamlit

pipenv shell
