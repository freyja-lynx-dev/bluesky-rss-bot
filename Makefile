compile:
	tsc -p .
run:
	node index.js
debug:
	node --inspect index.js
compile-then-run: compile run
compile-then-debug: compile debug
clean:
	rm index.js