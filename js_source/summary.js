window.summary = {
    tableMap: {},
    data: {},
    assetValues: {}, // Guarda a variação atual (%) de cada ativo por PID

    initSummary: function(tableName, data) {
        var self = this;
        self.data[tableName] = {
            currentAvg: 0,
            tableLength: data.length
        };
        
        data.forEach(function(obj) {
            self.assetValues[obj.pid] = 0;
        });
        
        self.tableMapper(tableName, data);
    },

    tableMapper: function(tableName, data) {
        var self = this;
        data.forEach(function(obj) {
            self.tableMap[obj.pid] = tableName;
        });
    },

    findTableByPid: function(pid) {
        return this.tableMap[pid];
    },

    getCurrentAvgOf: function(tableName) {
        var self = this;
        return self.data[tableName] ? self.data[tableName].currentAvg : 0;
    },

    getCurrentAvgFormatedOf: function(tableName) {
        var self = this;
        var avg = self.getCurrentAvgOf(tableName);
        var sign = avg > 0 ? "+" : "";
        return sign + avg.toFixed(2) + "%";
    },

    updateSummary: function(tableName, pidObj) {
        var self = this;
        var pid = pidObj.pid;
        var pcpValue = parseFloat(pidObj.pcp.replace("%", "").replace(",", "."));
        
        if (isNaN(pcpValue)) pcpValue = 0;
        
        // Atualiza a variação deste ativo na memória global
        self.assetValues[pid] = pcpValue;
        
        // Recalcula a média real exata de todos os ativos desta tabela
        var sum = 0;
        var count = 0;
        
        for (var assetPid in self.tableMap) {
            if (self.tableMap[assetPid] === tableName) {
                sum += (self.assetValues[assetPid] || 0);
                count++;
            }
        }
        
        var avg = count > 0 ? (sum / count) : 0;
        if (self.data[tableName]) {
            self.data[tableName].currentAvg = avg;
        }
        
        // Dispara o recálculo do WS Bias Engine caso tenhamos o arquivo de viés carregado
        if (window.biasEngine && typeof window.biasEngine.calculateBias === 'function') {
            window.biasEngine.calculateBias();
        }
    }
};
