window.getShadowRootElement = function(fullSelector, root) {

    return queryAllRoots(fullSelector, root);

    function findRoots(ele) {
        return [ele, ...ele.querySelectorAll("*")]
            .filter((e) => !!e.shadowRoot)
            .flatMap((e) => [e, e.shadowRoot, ...findRoots(e.shadowRoot)]);
    }

    function searchRoots(roots, selector) {
        return roots.reduce(function (acc, curr) {
            return acc.concat(...curr.querySelectorAll(selector));
        }, []);
    }

    function checkParent(leaf, selector) {
        if (leaf.parentElement) {
            return leaf.parentElement.matches(selector);
        } else {
            return leaf.getRootNode().host.matches(selector);
        }
    }

    function checkSiblings(leaf, selector) {
        if (leaf.parentElement) {
            return leaf.parentElement.querySelectorAll(":scope > " + selector);
        } else {
            return leaf.getRootNode().host.querySelectorAll(":scope > " + selector);
        }
    }

    function checkAdjacent(leaf, selector) {
        if (leaf.parentElement) {
            return leaf.nextSibling.matches(selector) || leaf.previousSibling.matches(selector);
        } else {
            return false;
        }
    }

    function checkAncestors(leaf, selector) {
        if (leaf.parentElement) {
            if (leaf.parentElement.matches(selector)) {
                return true;
            } else {
                return checkAncestors(leaf.parentElement, selector);
            }
        } else {
            let rootNode = leaf.getRootNode();

            if (rootNode == top.document) {
                return false;
            } else {
                if (rootNode.host.matches(selector)) {
                    return true;
                } else {
                    return checkAncestors(rootNode.host, selector);
                }
            }
        }
    }

    function getSelectorSets(fullSelector) {

        return parsel.tokenize(fullSelector).reduce(
            function (acc, curr) {
                let lastAcc = acc[acc.length - 1];
                if (curr.type == "comma") {
                    acc.push([""]);
                } else if (curr.type == "combinator") {
                    lastAcc.push(curr.content);
                    lastAcc.push("");
                } else {
                    lastAcc[lastAcc.length - 1] += curr.content;
                }

                return acc;
            },
            [[""]]
        );
    }

    function parseTextSearch(selectorStep) {
        let textSearch = false;
        let textContains = false;
        let textStartsWith = false;

        if (selectorStep.indexOf("[text") != -1) {
            let selectorStepParts = parsel.tokenize(selectorStep);
            selectorStep = selectorStepParts.map(function (selectorStepPart) {
                if (selectorStepPart.name != "text") {
                    return selectorStepPart.content;
                } else {
                    if (selectorStepPart.operator == "*=") {
                        textContains = JSON.parse(selectorStepPart.value);
                    } else if (selectorStepPart.operator == "^=") {
                        textStartsWith = JSON.parse(selectorStepPart.value);
                    }
                    textSearch = JSON.parse(selectorStepPart.value);
                    return "";
                }
            });
            selectorStep = selectorStep.join("");
        }

        return {
            selector: selectorStep,
            text: textSearch,
            contains: textContains,
            startsWith: textStartsWith
        };
    }

    function queryAllRoots(fullSelector, root) {
        if (!root || typeof root === "undefined") {
            root = document.body;
        }

        let leaves = [];
        let roots = findRoots(root);
        let selectorSets = getSelectorSets(fullSelector);
        roots.unshift(root);
        selectorSets.forEach(function (selectorSet) {
            leaves = leaves.concat(getSelectorSetMatches(selectorSet, roots));
        });

        return leaves;
    }

    function getSelectorSetMatches(selectorSteps, roots) {
        let leafSelector = selectorSteps.pop();
        leafSelector = parseTextSearch(leafSelector);

        let leaves = searchRoots(roots, leafSelector.selector);

        if (leafSelector.contains) {
            leaves = leaves.filter(function (leaf) {
                return leaf.innerText.indexOf(leafSelector.contains) != -1 || leaf.innerHTML.indexOf(leafSelector.contains) != -1;
            });
        } else if (leafSelector.startsWith) {
            leaves = leaves.filter(function (leaf) {
                return leaf.innerText.indexOf(leafSelector.startsWith) == 0 || leaf.innerHTML.indexOf(leafSelector.startsWith) == 0;
            });
        } else if (leafSelector.text) {
            leaves = leaves.filter(function (leaf) {
                return leaf.innerText == leafSelector.text || leaf.innerHTML == leafSelector.text;
            });
        }

        if (leaves.length > 0) {
            let mode = "descendant";
            selectorSteps.reverse();
            for (let i = 0; i < selectorSteps.length; i++) {
                let selectorStep = selectorSteps[i];

                if (selectorStep == " ") {
                    mode = "descendant";
                } else if (selectorStep == ">") {
                    mode = "child";
                } else if (selectorStep == "~") {
                    mode = "siblings";
                } else if (selectorStep == "+") {
                    mode = "adjacent";
                } else {
                    selectorStep = parseTextSearch(selectorStep);

                    leaves = leaves.filter(function (leaf) {
                        let match = false;
                        if (mode == "child") {
                            match = checkParent(leaf, selectorStep.selector);
                        } else if (mode == "descendant") {
                            match = checkAncestors(leaf, selectorStep.selector);
                        } else if (mode == "siblings") {
                            match = checkSiblings(leaf, selectorStep.selector);
                        } else if (mode == "adjacent") {
                            match = checkAdjacent(leaf, selectorStep.selector);
                        }


                        if (match && selectorStep.contains) {
                            leaves = leaves.filter(function (leaf) {
                                return leaf.innerText.indexOf(selectorStep.contains) != -1 || leaf.innerHTML.indexOf(selectorStep.contains) != -1;
                            });
                        } else if (match && selectorStep.startsWith) {
                            leaves = leaves.filter(function (leaf) {
                                return leaf.innerText.indexOf(selectorStep.startsWith) == 0 || leaf.innerHTML.indexOf(selectorStep.startsWith) == 0;
                            });
                        } else if (match && selectorStep.text) {
                            leaves = leaves.filter(function (leaf) {
                                return leaf.innerText == selectorStep.text || leaf.innerHTML == selectorStep.text;
                            });
                        } else {
                            return match;
                        }
                    });
                }
            }
        }

        leaves = [...new Map(leaves.map((item) => [item, item])).values()];
        return leaves;
    }
}
