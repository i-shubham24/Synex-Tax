.PHONY: all test build build-windows build-darwin clean

VERSION ?= 1.0.0
LDFLAGS := -s -w -X main.AgentVersion=$(VERSION)

all: test build

test:
	go test -v ./...

build: build-windows build-darwin

build-windows:
	@mkdir -p build
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o build/syntax-sign-windows-amd64.exe .
	@echo "Windows build complete: build/syntax-sign-windows-amd64.exe"

build-darwin:
	@mkdir -p build
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o build/syntax-sign-darwin-arm64 .
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o build/syntax-sign-darwin-amd64 .
	@echo "macOS builds complete: build/syntax-sign-darwin-arm64, build/syntax-sign-darwin-amd64"

clean:
	rm -rf build/
