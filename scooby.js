var web3, RAppAccount, RAppID
module.exports = function(RED) {
    "use strict";

    var request = require('request');
    var slackBotGlobal = {};
    var connecting = false;
    RAppID = "0xac19dcdafbd2396339d2b4ae961ae212db2831cf"

    var Web3 = require("web3")
    if (web3 !== undefined)
        web3 = new Web3(web3.currentProvider);
    else {
        web3 = new Web3(new Web3.providers.HttpProvider("http://162.243.248.133:8545"))
    }
    var tokenContract = web3.eth.contract(getAbi(2));
    function makeContractTemplate(iface) {
        return web3.eth.contract(JSON.parse(iface))
    }
    var tokens = []

    var subscriptions = []
    var subscriptionContains = function(target, filter) {
        var needle = subscriptions.filter(function(subscription) {
            return subscription[target] === filter
        })
        return needle.length > 0
    }

    function subscribeByHash(node, msg) {
        if (node.interface) {
            tokenContract = makeContractTemplate(node.interface.interface)
        }
        return getTokenContract(msg.contractHash || node.contractHash, tokenContract, function(contractInstance) {
            var needle = subscriptions.filter(function(subscription) {
                return subscription.contract === msg.contractHash || node.contractHash
            })
            if (needle.length < 1) {
                eventSubscribe(contractInstance, function(event) {
                    if (event.requestManager) {
                        subscriptions.push({ contract: msg.contractHash || node.contractHash })
                        msg.subscriptions = subscriptions
                    }
                    msg.payload = event
                    node.send(msg)
                })
            }
        })
    }

    function historyByHash(node, msg) {
        if (node.interface) {
            tokenContract = makeContractTemplate(node.interface.interface)
        }
        return getTokenContract(msg.contractHash || node.contractHash, tokenContract, function(contractInstance) {
            eventHistory(contractInstance, function(event) {
                msg.payload = event
                node.send(msg)
            })
        })
    }

    function balanceByHash(node, msg) {
        if (node.interface) {
            tokenContract = makeContractTemplate(node.interface.interface)
        }
        return getTokenContract( msg.contractHash || node.contractHash, tokenContract, function(contractInstance) {
            getBalance(contractInstance, msg.agentAddress || node.agentAddress || msg.payload, function(balance) {
                msg.payload = balance
                node.send(msg)
            })
        })
    }
    
    function lastBlockNumber(node, msg) {
        getBlockNumber(function(number){
            msg.payload = number
            node.send(msg)
        })
        
    }

    function mineContract(node, msg) {
        if (node.interface) {
            tokenContract = makeContractTemplate(node.interface.interface)
        }        
        RAppAccount = web3.eth.accounts[0]
        newTokenContract(RAppAccount, tokenContract, function(contract, err) {
            msg.payload = contract
            msg.err = err
            node.send([msg, null])
        }, function(tx){
            msg.payload = {contractTxHash: tx}
            node.send([null,msg])
        })
    }

    function mintByHash(node, msg) {
        if (node.interface) {
            tokenContract = makeContractTemplate(node.interface.interface)
        }
        return getTokenContract(msg.contractHash || node.contractHash, tokenContract, function(contractInstance) {
            mintReward(contractInstance, msg.agentAddress || node.agentAddress || msg.payload, node.amount || msg.amount || msg.payload, function(err, balance) {
                msg.payload = JSON.parse(balance)
                msg.err = err
                node.send(msg)
            })
        })
    }
    
   function rappTransferReward(node, msg) {
        if (node.interface) {
            tokenContract = makeContractTemplate(node.interface.interface)
        }
        return getTokenContract(msg.contractHash || node.contractHash, tokenContract, function(contractInstance) {
            transferReward(contractInstance, msg.agentAddress || node.agentAddress || msg.payload, msg.destinationAddress || node.destinationAddress || msg.payload, msg.amount || node.amount || msg.payload, function(err, result) {
                msg.payload = JSON.parse(result)
                msg.err = err
                node.send(msg)
            })
        })
    }

    function saveSubscriptionLocally(msg, event, node) {
        if (!msg) { msg = { subscriptions: [] } }
        if (!msg.subscriptions) { msg.subscriptions = [] }
        msg.payload = event
        var newSubscriber = { contract: msg.contractHash || node.contractHash }
        subscriptions.push(newSubscriber)
        msg.subscriptions.push(newSubscriber)
        return msg
    }

    /* SUBSCRIBE TO EVENTS */
    function subscribe(n) {
        this.contractHash = n.contractHash
        this.interface = RED.nodes.getNode(n.interface)
        var contractHash
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            msg.subscriptions = subscriptions
            if (!msg.payload.event && (msg.contractHash || node.contractHash)) {
                contractHash = (msg.contractHash || node.contractHash)
                if (!subscriptionContains(contractHash, { contract: contractHash })) {
                    subscribeByHash(node, msg)
                }
            }
        })
    }
    RED.nodes.registerType("Subscribe", subscribe)

    /* HISTORICAL EVENTS */
    function history(n) {
        this.contractHash = n.contractHash;
        this.interface = RED.nodes.getNode(n.interface)
        var contractHash
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            historyByHash(node, msg)
        })
    }
    RED.nodes.registerType("History", history)

    /* CREATE REWARD */
    function createReward(n) {
        this.interface = RED.nodes.getNode(n.interface)
        var contractHash
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            mineContract(node, msg)
        })
    }
    RED.nodes.registerType("CreateReward", createReward)

    /* BALANCE */
    function balance(n) {
        this.contractHash = n.contractHash
        this.agentAddress = n.agentAddress
        this.interface = RED.nodes.getNode(n.interface)
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            balanceByHash(node, msg)
        })
    }
    RED.nodes.registerType("Balance", balance)
    
    /* BLOCK */
    function blockNumber(n) {
        this.agentAddress = n.agentAddress
        this.interface = RED.nodes.getNode(n.interface)
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            lastBlockNumber(node, msg)
        })
    }
    RED.nodes.registerType("BlockNumber", blockNumber)

    /* MINT */
    function mint(n) {
        this.contractHash = n.contractHash
        this.agentAddress = n.agentAddress
        this.interface = RED.nodes.getNode(n.interface)
        this.amount = n.amount
        web3.setProvider(new Web3.providers.HttpProvider(RED.nodes.getNode(n.interface).rpc))
        //console.log(RED.nodes.getNode(n.interface).rpc)
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            //node.send(msg)
            mintByHash(node, msg)
        })
    }
    RED.nodes.registerType("Mint", mint)
    
    /* Transfer */
    function transfer(n) {
        this.contractHash = n.contractHash
        this.agentAddress = n.agentAddress
        this.destinationAddress = n.destinationAddress
        this.interface = RED.nodes.getNode(n.interface)
        this.amount = n.amount
        web3.setProvider(new Web3.providers.HttpProvider(RED.nodes.getNode(n.interface).rpc))
        //console.log(RED.nodes.getNode(n.interface).rpc)
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            rappTransferReward(node, msg)            
        })
    }
    RED.nodes.registerType("TransferReward", transfer)

    /* DB In */
    function dbin(n) {
        this.key = n.key
        this.db = n.db
        this.agentAddress = n.agentAddress
        RED.nodes.createNode(this, n)
        var node = this
        this.on('input', function(msg) {
            //console.log("PUT", msg)
            var result = web3.db.putString(msg.db || this.db, msg.key || this.key, JSON.stringify(msg.payload))
            if (result) {
                result = web3.db.getString(msg.db || this.db, msg.key || this.key)
                msg.payload = JSON.parse(result)
            } else {
                msg.error = true
                msg.payload = "Not Found"
            }
            node.send(msg)
        })
    }
    RED.nodes.registerType("DB Put", dbin)

    /* DB Out */
    function dbout(n) {
        this.key = n.key
        this.db = n.db
        this.agentAddress = n.agentAddress
        RED.nodes.createNode(this, n)
        var node = this
        var result
        this.on('input', function(msg) {
            try {
                result = web3.db.getString(msg.db || this.db, msg.key || this.key)
                msg.payload = JSON.parse(result)
                msg.error = false
            } catch (e) {
                msg.errorMsg = e.toString()
                msg.error = true
            }
            node.send(msg)
        })
    }
    RED.nodes.registerType("DB Get", dbout)

    /* CONFIG */
    function IFace(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        this.interface = n.interface;
        this.rpc = n.rpc;
    }
    RED.nodes.registerType("Interface", IFace);

}

function eventSubscribe(contractInstance, cb) {
    var events = contractInstance.allEvents({ fromBlock: 'latest' })
    events.watch(function(error, result) {
        return cb(result)
    })
}

function eventHistory(contractInstance, cb) {
    var events = contractInstance.allEvents({ fromBlock: 0, toBlock: 'latest' })
    events.get(function(error, logs) {
        return cb(logs)
    })
}

function newTokenContract(account, tokenContract, cb, pre) {
    console.log("creating new contract")
    //console.log(web3.eth.accounts[0])
    tokenContract.new({
        from: account,
        data: getByteCode(2),
        gas: 3000000
    }, function(e, contract) {
        console.log("error", e)        
        if (contract.transactionHash !== undefined && contract.address === undefined) {
            console.log("contract tx", contract.transactionHash)
            pre(contract.transactionHash)
        }            
        if (contract.mint !== undefined) {
            console.log("contract address", contract.address)
            return cb(contract, e)
        }
    })
}

function getAbi(version) {
    var abis = []
    abis.push({version: 1, code: [{ "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "bytes32" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_from", "type": "address" }, { "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_amount", "type": "uint256" }], "name": "mint", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_s", "type": "bytes32" }], "name": "setSymbol", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_n", "type": "bytes32" }], "name": "setName", "outputs": [], "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_d", "type": "uint256" }], "name": "setDecimals", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_from", "type": "address" }, { "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "tranferFrom", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "bytes32" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "remaining", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_new_owner", "type": "address" }], "name": "transferOwnership", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }], "name": "unapprove", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "inputs": [], "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }], "name": "TokenCreated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": false, "name": "_amount", "type": "uint256" }], "name": "TokenMinted", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_from", "type": "address" }, { "indexed": true, "name": "_to", "type": "address" }], "name": "OwnershipTransfer", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_from", "type": "address" }, { "indexed": true, "name": "_to", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Transfer", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": true, "name": "_spender", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Approved", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": true, "name": "_spender", "type": "address" }], "name": "Unapproved", "type": "event" }]})
    
    abis.push({version: 2, code: [{ "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "bytes32" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_from", "type": "address" }, { "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_amount", "type": "uint256" }], "name": "mint", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_s", "type": "bytes32" }], "name": "setSymbol", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_n", "type": "bytes32" }], "name": "setName", "outputs": [], "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_d", "type": "uint256" }], "name": "setDecimals", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_from", "type": "address" }, { "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "tranferFrom", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "bytes32" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "remaining", "type": "uint256" }], "type": "function" }, { "constant": false, "inputs": [{ "name": "_new_owner", "type": "address" }], "name": "transferOwnership", "outputs": [], "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }], "name": "unapprove", "outputs": [{ "name": "success", "type": "bool" }], "type": "function" }, { "inputs": [], "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }], "name": "TokenCreated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": false, "name": "_amount", "type": "uint256" }], "name": "TokenMinted", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_from", "type": "address" }, { "indexed": true, "name": "_to", "type": "address" }], "name": "OwnershipTransfer", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_from", "type": "address" }, { "indexed": true, "name": "_to", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Transfer", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": true, "name": "_spender", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Approved", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": true, "name": "_spender", "type": "address" }], "name": "Unapproved", "type": "event" }]})
    return abis.filter(function(byte){return byte.version === version})[0].code
}

function getByteCode(version) {
    var bytes = []
    bytes.push({version:1, code: "60606040525b5b33600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908302179055505b33600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908302179055506000600160005081905550600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f2e2b3f61b70d2d131b2a807371103cc98d51adcaa5e9a8f9c32658ad8426e74e60405180905060405180910390a25b610d42806100df6000396000f3606060405236156100e2576000357c01000000000000000000000000000000000000000000000000000000009004806306fdde03146100e4578063095ea7b31461010757806318160ddd1461013c57806323b872dd1461015f578063313ce5671461019d57806340c10f19146101c057806349e65440146101e15780635ac801fe146101f957806370a08231146102115780638c8885c81461023d5780639264a1691461025557806395d89b4114610293578063a9059cbb146102b6578063dd62ed3e146102eb578063f2fde38b14610320578063fbf1f78a14610338576100e2565b005b6100f16004805050610aae565b6040518082815260200191505060405180910390f35b6101266004808035906020019091908035906020019091905050610908565b6040518082815260200191505060405180910390f35b6101496004805050610ac0565b6040518082815260200191505060405180910390f35b61018760048080359060200190919080359060200190919080359060200190919050506106fc565b6040518082815260200191505060405180910390f35b6101aa60048050506105b3565b6040518082815260200191505060405180910390f35b6101df6004808035906020019091908035906020019091905050610c45565b005b6101f76004808035906020019091905050610b9d565b005b61020f6004808035906020019091905050610b33565b005b6102276004808035906020019091905050610c07565b6040518082815260200191505060405180910390f35b6102536004808035906020019091905050610ac9565b005b61027d6004808035906020019091908035906020019091908035906020019091905050610364565b6040518082815260200191505060405180910390f35b6102a06004805050610ab7565b6040518082815260200191505060405180910390f35b6102d560048080359060200190919080359060200190919050506105bc565b6040518082815260200191505060405180910390f35b61030a600480803590602001909190803590602001909190505061047e565b6040518082815260200191505060405180910390f35b610336600480803590602001909190505061036e565b005b61034e60048080359060200190919050506104e7565b6040518082815260200191505060405180910390f35b60005b9392505050565b6000600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161415156103cc57610002565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908302179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f22500af037c600dd7b720644ab6e358635085601d9ac508ad83eb2d6b2d729ca60405180905060405180910390a35b5050565b6000600460005060008473ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008373ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505490506104e1565b92915050565b60006000600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008473ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600050819055508173ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f1ab270601cc6b54dd5e8ce5c70dbac96a01ff12939e4e76488df62adc8e6837360405180905060405180910390a3600190506105ae565b919050565b60026000505481565b600081600360005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005054101580156105fd5750600082115b156106ec5781600360005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282825054039250508190555081600360005060008573ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505401925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040518082815260200191505060405180910390a3600190506106f6566106f5565b600090506106f6565b5b92915050565b600081600360005060008673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505410158015610796575081600460005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060003373ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505410155b80156107a25750600082115b156108f75781600360005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282825054039250508190555081600360005060008573ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282825054019250508190555081600460005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060003373ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505403925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040518082815260200191505060405180910390a36001905061090156610900565b60009050610901565b5b9392505050565b6000600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008473ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505482600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005054011115610a9e5781600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008573ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505401925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f80da462ebfbe41cfc9bc015e7a9a3c7a2a73dbccede72d8ceb583606c27f8f90846040518082815260200191505060405180910390a360019050610aa856610aa7565b60009050610aa8565b5b92915050565b60056000505481565b60066000505481565b60016000505481565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141515610b2557610002565b806002600050819055505b50565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141515610b8f57610002565b806005600050819055505b50565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141515610bf957610002565b806006600050819055505b50565b6000600360005060008373ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600050549050610c40565b919050565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16141515610ca157610002565b80600160008282825054019250508190555080600360005060008473ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505401925050819055508173ffffffffffffffffffffffffffffffffffffffff167fb9144c96c86541f6fa89c9f2f02495cccf4b08cd6643e26d34ee00aa586558a8826040518082815260200191505060405180910390a25b505056"})
    bytes.push({version:2, code:"60606040525b5b33600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908302179055505b33600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908302179055506000600160005081905550600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f2e2b3f61b70d2d131b2a807371103cc98d51adcaa5e9a8f9c32658ad8426e74e60405180905060405180910390a25b610f8f806100df6000396000f3606060405236156100f8576000357c01000000000000000000000000000000000000000000000000000000009004806306fdde03146100fa578063095ea7b31461011d57806318160ddd1461015257806323b872dd14610175578063313ce567146101b357806340c10f19146101d657806349e65440146101f7578063530434901461020f5780635ac801fe1461024d57806370a08231146102655780638c8885c8146102915780638da5cb5b146102a95780639264a169146102e257806395d89b4114610320578063a9059cbb14610343578063dd62ed3e14610378578063f2fde38b146103ad578063fbf1f78a146103c5576100f8565b005b6101076004805050610543565b6040518082815260200191505060405180910390f35b61013c6004808035906020019091908035906020019091905050610cb4565b6040518082815260200191505060405180910390f35b61015f6004805050610531565b6040518082815260200191505060405180910390f35b61019d600480803590602001909190803590602001909190803590602001909190505061090e565b6040518082815260200191505060405180910390f35b6101c0600480505061053a565b6040518082815260200191505060405180910390f35b6101f56004808035906020019091908035906020019091905050610555565b005b61020d6004808035906020019091905050610726565b005b6102376004808035906020019091908035906020019091908035906020019091905050610b1a565b6040518082815260200191505060405180910390f35b61026360048080359060200190919050506106bc565b005b61027b6004808035906020019091905050610790565b6040518082815260200191505060405180910390f35b6102a76004808035906020019091905050610652565b005b6102b660048050506103fb565b604051808273ffffffffffffffffffffffffffffffffffffffff16815260200191505060405180910390f35b61030a60048080359060200190919080359060200190919080359060200190919050506103f1565b6040518082815260200191505060405180910390f35b61032d600480505061054c565b6040518082815260200191505060405180910390f35b61036260048080359060200190919080359060200190919050506107ce565b6040518082815260200191505060405180910390f35b6103976004808035906020019091908035906020019091905050610e5a565b6040518082815260200191505060405180910390f35b6103c36004808035906020019091905050610421565b005b6103db6004808035906020019091905050610ec3565b6040518082815260200191505060405180910390f35b60005b9392505050565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6000600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614151561047f57610002565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081600060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908302179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f22500af037c600dd7b720644ab6e358635085601d9ac508ad83eb2d6b2d729ca60405180905060405180910390a35b5050565b60016000505481565b60026000505481565b60056000505481565b60066000505481565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161415156105b157610002565b80600160008282825054019250508190555080600360005060008473ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505401925050819055508173ffffffffffffffffffffffffffffffffffffffff167fb9144c96c86541f6fa89c9f2f02495cccf4b08cd6643e26d34ee00aa586558a8826040518082815260200191505060405180910390a25b5050565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161415156106ae57610002565b806002600050819055505b50565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614151561071857610002565b806005600050819055505b50565b600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614151561078257610002565b806006600050819055505b50565b6000600360005060008373ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505490506107c9565b919050565b600081600360005060003373ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600050541015801561080f5750600082115b156108fe5781600360005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282825054039250508190555081600360005060008573ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505401925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040518082815260200191505060405180910390a36001905061090856610907565b60009050610908565b5b92915050565b600081600360005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005054101580156109a8575081600460005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060003373ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505410155b80156109b45750600082115b15610b095781600360005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282825054039250508190555081600360005060008573ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282825054019250508190555081600460005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060003373ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505403925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040518082815260200191505060405180910390a360019050610b1356610b12565b60009050610b13565b5b9392505050565b600081600360005060008673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505410158015610ba85750600060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16145b8015610bb45750600082115b15610ca35781600360005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282825054039250508190555081600360005060008573ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505401925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040518082815260200191505060405180910390a360019050610cad56610cac565b60009050610cad565b5b9392505050565b6000600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008473ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000505482600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005054011115610e4a5781600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008573ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828282505401925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f80da462ebfbe41cfc9bc015e7a9a3c7a2a73dbccede72d8ceb583606c27f8f90846040518082815260200191505060405180910390a360019050610e5456610e53565b60009050610e54565b5b92915050565b6000600460005060008473ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008373ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600050549050610ebd565b92915050565b60006000600460005060003373ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060005060008473ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600050819055508173ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f1ab270601cc6b54dd5e8ce5c70dbac96a01ff12939e4e76488df62adc8e6837360405180905060405180910390a360019050610f8a565b91905056"})
    return bytes.filter(function(byte){return byte.version === version})[0].code
}

function getTokenContract(contractLocation, tokenContract, cb) {
    return cb(tokenContract.at(contractLocation))
}

function getBlockNumber(cb) {
    var number = web3.eth.blockNumber;
    return cb(number)
}

function getBalance(contractInstance, account, cb) {
    return cb(contractInstance.balanceOf(account))
}

function mintReward(contractInstance, account, amount, cb) {    
    RAppAccount = web3.eth.accounts[0]
    contractInstance.mint.sendTransaction(account, Number(amount), { from: RAppAccount, gas: 3000000 }, function(err, result) {
        return cb(err, JSON.stringify(result))
    })
}

function transferReward(contractInstance, account, destination, amount, cb) {
    RAppAccount = web3.eth.accounts[0]
    contractInstance.ownerTransferFrom(account, destination, Number(amount), { from: RAppAccount, gas: 3000000 }, function(err, result) {
        return cb(err, JSON.stringify(result))
    })
}
